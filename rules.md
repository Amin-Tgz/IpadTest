# rules.md


## Platform rules
- This is a **web app**. No Mac/Xcode native builds.
- Everything must work on **iPad Safari**: no text selection/callout on the page, `touch-action: none` on the canvas, safe-area insets respected, viewport `user-scalable=no`.

## Security rules
- API keys live **only** in `.env` (git-ignored). Never log, display, or send keys to the client.
- Never serve or commit `.env` or `node_modules`.

