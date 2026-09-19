# Your first golf workshop

> **Quick start:** install Node.js LTS, download and extract the app ZIP, open your computer’s Start file, then choose **Open as organizer**. Your first trip is completely invented.

## Before you begin

Use your own Mac, Windows or Linux computer. A phone can view a properly hosted private event later; it cannot run these desktop Start files. You do not need to learn Git or create a GitHub account. Do not open `index.html` directly: this app needs its local server.

1. Visit [Node.js downloads](https://nodejs.org/en/download) and install the LTS release for your computer. If a terminal was already open, close and reopen it after installation.
2. [Download the app ZIP](https://github.com/jessecmaddox3/golf-trip-workshop/releases/latest/download/golf-trip-workshop.zip).
3. Extract all files. On Windows, do not run Start from inside the ZIP preview.
4. Open `Start.cmd` on Windows or `Start.command` on Mac. On Linux, open a terminal in the extracted folder and type `sh start.sh`.
5. Wait for the installation and browser window. The first launch needs an internet connection to download the app’s dependencies. Later launches are faster.

The terminal shows the local address if the browser does not open automatically. Normally it is `http://127.0.0.1:5088`. Paste that address into your browser. Keep the terminal open while using the app; press Ctrl+C there to stop it.

## When double-click does not work

On Mac, macOS may block an unsigned downloaded command file. You can run the same plain-text script from Terminal without changing system security settings:

1. Open **Terminal** from Applications → Utilities.
2. Type `bash` followed by a space, then drag `Start.command` from the extracted folder into Terminal.
3. Press Return. The command should contain `bash` followed by the complete path to your Start file.

On Windows, open the extracted folder, click File Explorer’s address bar, type `cmd` and press Enter. Type `node scripts\launch.mjs` and press Enter. If Windows reports that Node is missing, complete the Node installer and open a new command window.

On any system, you can open a terminal in the project folder and run `node scripts/launch.mjs`. You can read that script before running it. It installs the pinned dependencies, builds the browser app and starts a server bound to your own computer.

## A ten-minute tour

Choose **Open as organizer**. The demo identity menu can also switch to a participant or scorekeeper. The phase menu shows the same event before, during and after the trip.

1. Open **Trip proposals**, choose an idea, then change its Budget options. Copy a scenario link or print the summary. These five examples deliberately use different budgeting approaches.
2. Open **Competition**. Expand a match, move between holes and enter a score. The save bar says when the shared copy is saved. Remove a score with **Clear hole**.
3. Open **Rosters** to compare handicaps and tee choices. Open **Course playbook** for strategy, holes, maps and tee matrices.
4. Open **Finances** and add an invented expense. See how the exact cents are split and who would reimburse whom. The app does not send a payment.
5. Choose an invented participant in the demo identity menu and open **Trip poll**. Answer a few questions, then inspect the group results. Participants can view the tournament but cannot change its scores or shared records.
6. Open **Settings** and export a backup. Your demo is saved in `.local/demo` inside the project folder unless you configured a separate demo directory.

## If something goes wrong

**The window closes or the app never appears:** open a terminal in the extracted folder and run `node scripts/launch.mjs`. Read the last error. Confirm that `node --version` is at least 22.12 and that the first launch has internet access.

**The port is already in use:** stop the other workshop terminal and reopen Start. The launcher will not open an unrelated service using that port. A terminal user can select another port with the `PORT` environment variable.

**Your changes say pending, offline or conflict:** keep the tab open and download the recovery file offered by the save bar. When a conflict appears, compare both versions before choosing which to keep. Do not clear browser storage to fix a pending save.

**A second tab will not open the editable event:** use one tab per identity. Close the first tab and reload the second. The app protects the saved recovery journal rather than letting two tabs overwrite it.

**The saved folder no longer matches configuration:** restore the matching configuration and build. Do not delete an established store to make the error disappear. The [customization guide](CUSTOMIZE.md) explains this boundary.

**You want a fresh invented tournament:** Settings has **Download backup and reset demo** for organizer identities. Poll responses are stored separately and are not reset by that button. A completely separate demo can use a new `GOLF_DEMO_DATA_DIR`.
