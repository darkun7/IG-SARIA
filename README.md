# IG-SARIA

A Chrome extension that analyzes an Instagram profile's **followers** and **following** lists.

## Features

- Enter a username (or URL) and jump straight to the profile.
- **One button** — "Analyze Followers & Following" scrapes both lists automatically using Instagram's internal API (your logged-in session), no scrolling required.
- **Safety check:** if the account has more than **10,000 followers**, the extension shows a "Not recommended" warning and blocks scraping.
- Opens a **dashboard recap** with:
  - **Mutual** — people you follow who follow you back
  - **Not following back** — accounts you follow that don't follow you back
  - **Fans** — followers you don't follow back
  - Full follower / following lists
- Click any account to open their Instagram profile in a new tab.
- Filter the list live, and export the current view as CSV.
- Progress indicator while collecting; shows if you're not logged in (Instagram hides lists for logged-out users).

## Install (unpacked extension)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `IG-SARIA` folder.
5. Pin the extension from the puzzle-piece menu.

## Usage

1. Make sure you are **logged in** to Instagram in the same Chrome browser.
2. Open a profile page (or type a username into the popup and press **Go**).
3. Click the IG-SARIA icon and press **Analyze Followers & Following**.
4. Wait while it collects both lists (progress is shown in the popup).
5. The **dashboard** opens in a new tab with the full recap — click any account to open its profile.

## Build

```
make check    # validate manifest + JS syntax
make build    # create dist/IG-SARIA-<version>.zip
make clean    # remove dist/
```

## Notes

- Scraping large lists takes time; the tool is intentionally blocked above 10k followers.
- This is for personal/educational use. Respect Instagram's Terms of Service and rate limits.
