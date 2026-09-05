# Draft X (Twitter) thread — demo requirement

The listing's demo requirement: a thread that (1) explains what the app does,
(2) demonstrates how users can use it, (3) includes a guide directing users to the
Cookie Chain Bridge — then share the thread in the Cookie Chain Telegram
(t.me/TheCookieNetChain). Owner posts from their X account. Bracketed = capture at
post time.

**1/**
We built Cookie Clash — wagered, fully on-chain tic-tac-toe on @CookieChain 🍪

Two players stake $COOK. The stake is escrowed by an Anchor program, and the winner is
paid in the SAME transaction as the winning move. No backend. No oracles. Pure SVM.

**2/**
Why this could only be built cheap on Cookie Chain:
• ~400ms slots → every move + payout confirms in under a second, live
• Fractions-of-a-cent fees → betting per move actually makes sense
• Solana tooling (Anchor, web3.js) works unchanged on its SVM

**3/ How to play** 🧵 [screenshot 1: app with wallet connected]
1. Open [LIVE_URL] in your browser
2. Connect your Nightly wallet (Settings → Networks → add Cookie Chain, RPC
   https://rpc.cookiescan.io)
3. "Create game" → pick an opponent + your $COOK stake
4. They hit Join → the pot is fully escrowed on-chain

**4/ Demo** 🎥 [screen recording: create → join → 5 moves, each confirming <1s →
winning move pays the pot instantly; live feed showing clash:* logs]

That's a real 2-player match, one machine, zero off-chain components.
(One person? The repo's CLI bot plays the opponent side.)

**5/ New to Cookie Chain? Get $COOK in 2 minutes:** 🌉
1. Buy a few dollars of $COOK on Solana via Jupiter (mint
   36ZrtQoab5MhhySaP1YSTwUahSk6GRVUTtZ6cuVfm9e1)
2. Bridge 1:1 to Cookie Chain at the official bridge:
   https://hyperlane.cookiescan.io
A dollar covers thousands of games.

**6/**
Everything is open source — Anchor program (create/join/move/cancel/timeout-refund),
React frontend, README with setup + deploy:
https://github.com/mskutlu/cookie-clash

Program: 8t1WJbixxfUk9Q3eyVt7DaGi8y2fE2embzHdBU9hFXh6 on Cookie Chain mainnet

Then: share the posted thread in https://t.me/TheCookieNetChain (Final Step on the
listing) and paste the thread URL into the submission where asked.
