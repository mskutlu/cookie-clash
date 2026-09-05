//! Cookie Clash — wagered on-chain tic-tac-toe for Cookie Chain (SVM).
//!
//! Two players stake native COOK (lamports) on a game. The stake is escrowed
//! in the game PDA itself; the winner takes the pot in the same transaction
//! as the winning move. Sub-second finality on Cookie Chain makes every move
//! (and the payout) land in front of the players.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;

declare_id!("8t1WJbixxfUk9Q3eyVt7DaGi8y2fE2embzHdBU9hFXh6");

const CELL_EMPTY: u8 = 255;
const MARK_A: u8 = 1;
const MARK_B: u8 = 2;

pub const MIN_STAKE_LAMPORTS: u64 = 1_000_000; // 0.001 COOK
pub const TIMEOUT_SLOTS: u64 = 15_000; // ~100 min of inactivity at ~2.5 slots/s

// status values
const STATUS_WAITING: u8 = 0; // created, waiting for the opponent to join
const STATUS_ACTIVE: u8 = 1; // both stakes escrowed, moves in progress
const STATUS_FINISHED: u8 = 2; // someone won, pot paid out
const STATUS_DRAW: u8 = 3; // board full, stakes refunded
const STATUS_CANCELLED: u8 = 4; // creator cancelled before the join
const STATUS_ABANDONED: u8 = 5; // timeout refund paid

const LINES: [[usize; 3]; 8] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

#[program]
pub mod cookie_clash {
    use super::*;

    /// Create a direct challenge. Escrows the creator's stake into the game PDA.
    pub fn create_game(ctx: Context<CreateGame>, opponent: Pubkey, stake: u64, seed: u16) -> Result<()> {
        require!(stake >= MIN_STAKE_LAMPORTS, ClashError::StakeTooSmall);
        require!(opponent != ctx.accounts.player_a.key(), ClashError::SelfPlay);

        let pda_key = ctx.accounts.game.key();
        let (a_key, b_key) = {
            let g = &mut ctx.accounts.game;
            g.player_a = ctx.accounts.player_a.key();
            g.player_b = opponent;
            g.stake = stake;
            g.seed = seed;
            g.turn = 0;
            g.cells = [CELL_EMPTY; 9];
            g.status = STATUS_WAITING;
            g.bump = ctx.bumps.game;
            g.last_move_slot = Clock::get()?.slot;
            (g.player_a, g.player_b)
        };

        invoke(
            &system_instruction::transfer(&ctx.accounts.player_a.key(), &pda_key, stake),
            &[
                ctx.accounts.player_a.to_account_info(),
                ctx.accounts.game.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        msg!("clash:new game={} a={} b={} stake={}", pda_key, a_key, b_key, stake);
        Ok(())
    }

    /// Join a waiting game. Escrows the joiner's stake — the pot is now full.
    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        let stake = {
            let g = &mut ctx.accounts.game;
            require!(g.status == STATUS_WAITING, ClashError::NotWaiting);
            require!(ctx.accounts.player_b.key() == g.player_b, ClashError::Unauthorized);
            g.status = STATUS_ACTIVE;
            g.last_move_slot = Clock::get()?.slot;
            g.stake
        };
        invoke(
            &system_instruction::transfer(&ctx.accounts.player_b.key(), &ctx.accounts.game.key(), stake),
            &[
                ctx.accounts.player_b.to_account_info(),
                ctx.accounts.game.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )
        .map_err(|_| error!(ClashError::StakeTransferFailed))?;
        msg!("clash:join game={} b={}", ctx.accounts.game.key(), ctx.accounts.player_b.key());
        Ok(())
    }

    /// Play a cell. On a winning move the pot is paid to the winner inside
    /// this same transaction; on a full board both stakes are refunded.
    pub fn make_move(ctx: Context<MakeMove>, cell: u8) -> Result<()> {
        let outcome = {
            let g = &mut ctx.accounts.game;
            require!(g.status == STATUS_ACTIVE, ClashError::NotActive);
            require!((cell as usize) < 9, ClashError::BadCell);
            let is_a = ctx.accounts.mover.key() == g.player_a;
            let is_b = ctx.accounts.mover.key() == g.player_b;
            require!(is_a || is_b, ClashError::NotAPlayer);
            require!(is_a == (g.turn % 2 == 0), ClashError::NotYourTurn);
            require!(g.cells[cell as usize] == CELL_EMPTY, ClashError::CellTaken);

            g.cells[cell as usize] = if is_a { MARK_A } else { MARK_B };
            g.last_move_slot = Clock::get()?.slot;

            let line = LINES.iter().find(|l| {
                g.cells[l[0]] != CELL_EMPTY
                    && g.cells[l[0]] == g.cells[l[1]]
                    && g.cells[l[1]] == g.cells[l[2]]
            });
            if line.is_some() {
                g.status = STATUS_FINISHED;
                Outcome::Win(is_a)
            } else if g.cells.iter().all(|&c| c != CELL_EMPTY) {
                g.status = STATUS_DRAW;
                Outcome::Draw
            } else {
                g.turn = g.turn.wrapping_add(1);
                Outcome::Continue
            }
        };

        match outcome {
            Outcome::Win(won_by_a) => {
                let pot = ctx.accounts.game.stake.checked_mul(2).unwrap();
                let to = if won_by_a {
                    ctx.accounts.payout_a.to_account_info()
                } else {
                    ctx.accounts.payout_b.to_account_info()
                };
                pay(&ctx.accounts.game.to_account_info(), &to, pot)?;
                msg!("clash:win pot={} winner={}", pot, to.key());
            }
            Outcome::Draw => {
                let half = ctx.accounts.game.stake;
                pay(&ctx.accounts.game.to_account_info(), &ctx.accounts.payout_a.to_account_info(), half)?;
                pay(&ctx.accounts.game.to_account_info(), &ctx.accounts.payout_b.to_account_info(), half)?;
                msg!("clash:draw refund={}", half);
            }
            Outcome::Continue => {
                msg!("clash:move cell={}", cell);
            }
        }
        Ok(())
    }

    /// Creator cancels a game nobody joined — stake goes straight back.
    pub fn cancel_game(ctx: Context<CancelGame>) -> Result<()> {
        let stake = {
            let g = &mut ctx.accounts.game;
            require!(g.status == STATUS_WAITING, ClashError::NotWaiting);
            require!(ctx.accounts.player_a.key() == g.player_a, ClashError::Unauthorized);
            g.status = STATUS_CANCELLED;
            g.stake
        };
        pay(&ctx.accounts.game.to_account_info(), &ctx.accounts.player_a.to_account_info(), stake)?;
        msg!("clash:cancel refund={}", stake);
        Ok(())
    }

    /// Either player can refund an abandoned active game after TIMEOUT_SLOTS
    /// of inactivity. No off-chain clockwork involved.
    pub fn timeout_refund(ctx: Context<TimeoutRefund>) -> Result<()> {
        let stake = {
            let g = &mut ctx.accounts.game;
            require!(g.status == STATUS_ACTIVE, ClashError::NotActive);
            let is_player = ctx.accounts.caller.key() == g.player_a || ctx.accounts.caller.key() == g.player_b;
            require!(is_player, ClashError::NotAPlayer);
            let idle = Clock::get()?.slot.saturating_sub(g.last_move_slot);
            require!(idle >= TIMEOUT_SLOTS, ClashError::TimeoutNotReached);
            g.status = STATUS_ABANDONED;
            g.stake
        };
        pay(&ctx.accounts.game.to_account_info(), &ctx.accounts.payout_a.to_account_info(), stake)?;
        pay(&ctx.accounts.game.to_account_info(), &ctx.accounts.payout_b.to_account_info(), stake)?;
        msg!("clash:timeout refund={}", stake);
        Ok(())
    }
}

enum Outcome {
    Win(bool), // true if player A won
    Draw,
    Continue,
}

/// Move `amount` lamports from the game PDA (program-owned, so direct
/// lamport access is legal) to `to`. The game account keeps its
/// rent-exempt minimum — only the pot moves.
fn pay(game: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    require!(game.key() != to.key(), ClashError::WrongPayout);
    let game_lamps = game.lamports();
    require!(game_lamps >= amount, ClashError::InsufficientPot);
    **game.try_borrow_mut_lamports()? = game_lamps - amount;
    **to.try_borrow_mut_lamports()? = to.lamports().checked_add(amount).unwrap();
    Ok(())
}

#[account]
#[derive(InitSpace)]
pub struct Game {
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub stake: u64,
    pub seed: u16,
    pub turn: u8,
    pub cells: [u8; 9],
    pub status: u8,
    pub bump: u8,
    pub last_move_slot: u64,
}

#[derive(Accounts)]
#[instruction(opponent: Pubkey, stake: u64, seed: u16)]
pub struct CreateGame<'info> {
    #[account(
        init,
        payer = player_a,
        space = 8 + Game::INIT_SPACE,
        seeds = [b"game", player_a.key().as_ref(), &seed.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub player_a: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.player_a.as_ref(), &game.seed.to_le_bytes()],
        bump = game.bump
    )]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub player_b: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MakeMove<'info> {
    #[account(
        mut,
        seeds = [b"game", game.player_a.as_ref(), &game.seed.to_le_bytes()],
        bump = game.bump
    )]
    pub game: Account<'info, Game>,
    pub mover: Signer<'info>,
    /// CHECK: validated by the constraint below to be the stored player_a wallet
    #[account(
        mut,
        constraint = payout_a.key() == game.player_a @ ClashError::WrongPayout,
        constraint = payout_a.key() != game.key() @ ClashError::WrongPayout
    )]
    pub payout_a: UncheckedAccount<'info>,
    /// CHECK: validated by the constraint below to be the stored player_b wallet
    #[account(
        mut,
        constraint = payout_b.key() == game.player_b @ ClashError::WrongPayout,
        constraint = payout_b.key() != game.key() @ ClashError::WrongPayout
    )]
    pub payout_b: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.player_a.as_ref(), &game.seed.to_le_bytes()],
        bump = game.bump
    )]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub player_a: Signer<'info>,
}

#[derive(Accounts)]
pub struct TimeoutRefund<'info> {
    #[account(
        mut,
        seeds = [b"game", game.player_a.as_ref(), &game.seed.to_le_bytes()],
        bump = game.bump
    )]
    pub game: Account<'info, Game>,
    pub caller: Signer<'info>,
    /// CHECK: validated by the constraint below to be the stored player_a wallet
    #[account(
        mut,
        constraint = payout_a.key() == game.player_a @ ClashError::WrongPayout,
        constraint = payout_a.key() != game.key() @ ClashError::WrongPayout
    )]
    pub payout_a: UncheckedAccount<'info>,
    /// CHECK: validated by the constraint below to be the stored player_b wallet
    #[account(
        mut,
        constraint = payout_b.key() == game.player_b @ ClashError::WrongPayout,
        constraint = payout_b.key() != game.key() @ ClashError::WrongPayout
    )]
    pub payout_b: UncheckedAccount<'info>,
}

#[error_code]
pub enum ClashError {
    #[msg("Stake too small (minimum 0.001 COOK)")]
    StakeTooSmall,        // 6000
    #[msg("You cannot challenge yourself")]
    SelfPlay,             // 6001
    #[msg("Game is not waiting for a player to join")]
    NotWaiting,           // 6002
    #[msg("Game is not active")]
    NotActive,            // 6003
    #[msg("You are not a player in this game")]
    NotAPlayer,           // 6004
    #[msg("It is not your turn")]
    NotYourTurn,          // 6005
    #[msg("Cell is already taken")]
    CellTaken,            // 6006
    #[msg("Cell must be 0-8")]
    BadCell,              // 6007
    #[msg("Unauthorized")]
    Unauthorized,         // 6008
    #[msg("Game has not been idle long enough to refund")]
    TimeoutNotReached,    // 6009
    #[msg("Pot underflow")]
    InsufficientPot,      // 6010
    #[msg("Wrong payout account")]
    WrongPayout,          // 6011
    #[msg("Stake transfer failed")]
    StakeTransferFailed,  // 6012
}
