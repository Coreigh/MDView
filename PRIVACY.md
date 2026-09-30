# Privacy policy

MDView is a single-page application that runs entirely in your browser. The application code, your documents, and any preferences you set never leave your device. mdview does not collect, transmit, sell, or share any data with the authors or any third party.

***Because*** **MDView** provides you the opportunity to reload a document from a previous session you may see a browser message that says the site "wants to: view and edit files from the last time you visited this site". Choosing "Don't Allow" may disable this feature.

**Data stored on your device.** To restore your work across reloads, browser restarts, and accidental tab closes, mdview keeps a copy of your current document and a File System Access handle (where applicable) in your browser's sessionStorage, localStorage, and IndexedDB. The full inventory, scope, and lifetime of each is described in the "Local data storage" section below. These locations are accessible only to this origin (the mdview URL you loaded) on this browser profile.

**Third-party components.** mdview is built on third-party libraries listed in the Credits section above. Those libraries are bundled with the application code and run locally - none of them initiate network requests from mdview, and none of them collect or transmit your content. The optional PHP proxy in dev, if enabled in Settings, is the single exception: when on, URLs you drag into the editor are relayed through your own server to bypass browser CORS rules. The proxy is opt-in, defaults to off, and is described in detail in the Settings panel.

**Your choices.** You can erase mdview's stored data at any time. Click *Dismiss* on the restore banner to clear `mdview:lastKnown` (the cross-session snapshot). For full erasure, use your browser's site-data controls - for example, "Site data" / "Cookies and other site data" in Chrome, Firefox, Safari, or Edge - to clear this site's sessionStorage, localStorage, and IndexedDB. Closing the tab clears `mdview:session` automatically.
