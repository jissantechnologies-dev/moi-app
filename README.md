# Moi Book — மொய் நோட்டு

A mobile app to record the gifts (moi) you give at functions and the ones you
receive, so you always know who you still owe and who owes you.

Every entry stores: **first name, last name, phone number, place, function name,
date of the function, direction (given / received), gift type (cash / gold /
other), amount in rupees, gold weight in grams with its carat, gift details and
notes.**

The app is bilingual — tap the **தமிழ் / EN** button in the top right to switch.
All data is stored on the phone itself; nothing is uploaded anywhere.

## Screens

- **Entries** — every gift, newest function first, with a search box over name,
  phone, place and function.
- **People** — the same records grouped by person (matched on phone number, or on
  name + place when there is no phone). Each row carries its own three-column
  ledger: **Given**, **Received**, and the **Balance** between them, with the gold
  grams for each underneath. So you can see both halves of the relationship
  without opening anyone.
- **Person detail** — the same given / received / balance figures for that one
  person, above their full history. See [History with one person](#history-with-one-person).
- **Entry form** — add, edit or delete a record.

The summary card at the top of the home screen shows the same totals across
everyone.

## History with one person

Opening someone from the People tab shows every gift between you, ordered by the
date of the function. Above it:

- **All / Given / Received** — narrow the history to one side. The totals card
  follows the filter, and its balance bars are hidden while a one-sided filter is
  on, because half a history has no balance.
- **↓ Newest first / ↑ Oldest first** — flip the order. Newest first is the
  default; oldest first reads the relationship from the beginning.

Entries sharing a function date fall back to the order they were entered, so the
list never reshuffles between visits. The Entries tab uses the same ordering.

## Entering a person

The phone field has a **Contacts** button beside it. It opens the system contact
picker, so the app never reads your whole address book - only the one person you
tap comes back. The number is tidied up ("+91 98765 43210" becomes
"+919876543210", a leading zero is kept), and the first and last name are filled
in only if you have not already typed them.

The button is hidden in the browser preview, where there is no address book.

## Date of function

Tapping the date opens a month calendar: arrows move between months, the
selected day is filled in, today is outlined, and **Today** jumps back. It is
built from plain views rather than the OS picker, so the phone and the browser
preview behave identically and the month names follow the language toggle.

## Gold

Choosing **Gold** as the gift type gives you a weight in grams and a purity
(24K / 22K / 18K); the rupee value becomes optional, for when you also want to
note what it was worth on the day.

Gold is tracked as a second, separate balance — grams are never converted into
rupees or mixed into the cash total. So a person can show "you are behind by
Rs. 2,000" and "gold still to give 4 g" at the same time, which is how these
obligations actually work.

Gram totals are summed as-is, without adjusting for purity, because that is how
gold gifts are talked about. The carat of each individual gift is recorded and
shown on its row.

## Export and backup

The **⋯** button in the top right opens three options:

- **Export to CSV** — one row per entry, opened in Excel or shared straight to
  WhatsApp. Phone numbers keep their leading zero and Tamil text displays
  correctly (the file carries a BOM).
- **Backup all data** — a `.json` file with everything in it. Save it to Drive,
  mail it to yourself, or keep it in WhatsApp.
- **Restore from backup** — pick a backup file and it replaces everything
  currently in the app, after a confirmation. Files that are not Moi Book
  backups are rejected, and backups written by older versions of the app still
  load (missing fields fall back to sensible defaults).

Backups are the only protection against losing the ledger if the phone is reset,
so take one now and then.

## Tests

```
npm test        # CSV escaping, backup round-tripping, calendar grid, phone tidying
npm run typecheck
```

## Running it on your phone

1. Install **Expo Go** from the Play Store / App Store.
2. In this folder run:

   ```
   npm install     # first time only
   npm start
   ```

3. Scan the QR code in the terminal with Expo Go (Android) or the Camera app
   (iOS). The phone and the computer must be on the same Wi-Fi.

`npm run android` opens it directly in a connected device or emulator.

## Building an installable APK

Expo Go is enough for daily use, but for a standalone app:

```
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

EAS builds in the cloud and gives you an APK download link. No Android Studio
needed.

## Project layout

```
App.tsx                    screen routing + load/save wiring
src/types.ts               Entry, Settings, Direction, GiftKind
src/storage.ts             AsyncStorage read/write
src/backupFormat.ts        CSV and backup JSON (pure, no native modules)
src/backupFormat.test.ts   assertions for the above
src/export.ts              writing those files and opening the share sheet
src/i18n.ts                English and Tamil strings
src/format.ts              rupee/gram/date formatting, totals, grouping key
src/theme.ts               colours and spacing
src/components/ui.tsx      Field, Segmented, Button, Avatar
src/components/MenuSheet.tsx  export / backup / restore sheet
src/components/Calendar.tsx   month-grid date picker
src/contacts.ts            system contact picker
src/dates.test.ts          assertions for the calendar and phone tidying
metro.config.js            enables package exports (needed by expo-contacts)
src/screens/Home.tsx       list, search, tabs, totals
src/screens/EntryForm.tsx  add / edit / delete
src/screens/PersonDetail.tsx  one person's history and balance
```

## Notes on the data

- `amount` is always a rupee figure. For a gold or other gift it is the estimated
  worth and may be left at 0; the description goes in `giftNote` (e.g. "chain").
- `goldGrams` and `goldCarat` are only meaningful when `giftKind` is `gold`.
- Balance = received − given. A positive balance means you have received more than
  you gave, so you are the one still to reciprocate.
- Entries with a phone number group reliably; entries without one group by name
  and place, so keeping the place consistent helps.
