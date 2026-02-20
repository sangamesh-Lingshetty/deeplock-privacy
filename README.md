# Privacy Policy for DeepLock

**Last Updated: January 28, 2026**

## Overview

DeepLock is a Chrome extension that helps users maintain focus by blocking distracting websites during timed sessions.

## Data Collection

**DeepLock does NOT collect, store, transmit, or sell any personal data.**

All data is stored locally on your device using Chrome's `chrome.storage.local` API.

## What Data is Stored Locally

The following data is stored on your device only:

- Focus session preferences (selected duration)
- Lock end time (timestamp)
- Lock status (active/inactive)

**This data:**
- Never leaves your computer
- Is not transmitted to any server
- Is not accessible to the extension developer
- Is automatically deleted when you uninstall the extension

## Permissions Explained

DeepLock requests the following Chrome permissions:

### `storage`
**Why:** To save your session preferences locally on your device.
**What we access:** Only the lock status and timer data.

### `declarativeNetRequest` and `declarativeNetRequestFeedback`
**Why:** To block specified websites during active focus sessions.
**What we access:** Only the ability to redirect blocked sites to our block page.

### `host_permissions` (Instagram, X, YouTube, Reddit, Facebook, TikTok, Netflix)
**Why:** To identify which sites should be blocked during focus sessions.
**What we access:** Only the domain name to determine if blocking should occur.

### `management`
**Why:** To detect if the extension is disabled during an active session (for logging purposes only).
**What we access:** Only whether the extension is enabled or disabled.

## What We Don't Do

DeepLock does NOT:

- ❌ Track your browsing history
- ❌ Collect analytics or usage data
- ❌ Use cookies
- ❌ Share data with third parties
- ❌ Run advertisements
- ❌ Access your personal information
- ❌ Monitor your activity outside of blocking functionality

## Blocked Sites

DeepLock blocks access to the following domains during active focus sessions:

- instagram.com
- twitter.com / x.com
- youtube.com
- reddit.com
- facebook.com
- tiktok.com
- netflix.com

The extension only blocks these sites. It does not monitor or record your activity on any website.

## Data Deletion

All data stored by DeepLock can be deleted by:

1. Uninstalling the extension, OR
2. Clearing Chrome's extension data via Settings > Privacy > Clear browsing data > Cookies and site data

## Children's Privacy

DeepLock does not knowingly collect data from anyone, including children under 13.

## Changes to This Policy

If we update this privacy policy, we will post the new policy here with an updated "Last Updated" date.

Material changes will be communicated via the Chrome Web Store listing.

## Contact

For questions about this privacy policy:

- GitHub: [Your GitHub Username]
- Email: [Your Email]

## Open Source

DeepLock's code is transparent. You can review exactly what the extension does by inspecting the source code (available upon request).

## Consent

By installing and using DeepLock, you consent to this privacy policy.
