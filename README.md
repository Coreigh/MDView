# MDView

MDView is a lightweight, secure, and mobile-friendly Markdown editor and live previewer. It bridges the gap between bare-bones markdown parsers and overly complex, feature-bloated editors by providing a distraction-free, self-contained environment tailored for efficient text manipulation and rendering.
Built as a robust extension of the MarkedJS parser, MDView incorporates essential productivity enhancements—such as split-pane scroll synchronization, multi-source document ingestion, and layered session persistence—without introducing unnecessary layout friction or cognitive overhead.

---

## Core Features
## Editor & Preview Interface

* Synchronized Split-Pane Layout: Real-time rendering in a dual-pane view with precise scroll synchronization between the editor and preview boundaries.
* Responsive Visual Toggles: Full mobile optimization featuring dedicated view controls to isolate the edit pane, isolate the preview pane, or split them evenly.
* Interface Amenities: Native light and dark theme modes, an integrated hamburger navigation menu, responsive in-app interactive guides, a Markdown syntax documentation modal, and visual outbound-link affordances.

## Data Ingestion & Export (Multi-IO)

* Flexible Input Vectors: Open files seamlessly via a standard file picker, drag-and-drop operations, or raw URL dragging handled via an integrated proxy engine. Full File System Access (FSA) API integration allows for native file picking workflows.
* Flexible Output Vectors: Save modified content in-place, export as raw text (.txt or .md), or compile the document into a self-contained, CSS-wrapped HTML file.

## Security & Architecture

* Fail-Closed Sanitization: Every render pass is intercepted and scrubbed using a DOMPurify wrapper to prevent Cross-Site Scripting (XSS) vectors.
* Layered Persistence: Input data is preserved across sessions using a tiered strategy spanning SessionStorage, LocalStorage, and IndexedDB (IDB), complete with a non-intrusive session restore banner.
* Hardened Deployment: Zero external dependencies at runtime. All vendor libraries are strictly local (vendored) to accommodate a strict Content Security Policy (CSP) and ensure absolute privacy.

------------------------------
## Technical Architecture
MDView is engineered to operate entirely on the client side as a single-page architecture, making it trivial to host statically or distribute as an offline utility.

* Parser core: MarkedJS
* Sanitization: DOMPurify
* Storage tier: Web Storage API (LocalStorage/SessionStorage) + IndexedDB
* Target environment: Modern web browsers (with upcoming compilation vectors)

------------------------------
## Deployment & Usage## Web Deployment
MDView is designed as a self-contained deployment. Host on your local webserver or launch a lightweight web server with Python:

   1. Clone or download the repository contents.
   2. Serve the directory using any static web server, or open the primary index.html file directly in a browser environment.

# Example using a basic Python static server
```
python3 -m http.server 8080
```

Once running, open your prowser and navigate to `http://localhost:8080`.

If you do not have Python installed, you can follow the official [Python Download and Installation Guide](https://www.python.org/downloads/ "Python Downloads").

------------------------------
## Roadmap & Future Scope

* Containerization: Packages and configurations to deploy MDView as an isolated micro-service via Docker.
* Desktop Application: Compilation into a standalone cross-platform desktop application utilizing Electron or Tauri frameworks.
* Bidirectional De-serialization (Reverse Parsing): A future input-pipeline modification allowing raw HTML to be pasted into the preview pane and programmatically converted back into optimized Markdown text within the editor pane.

------------------------------
## Credits & Acknowledgments
MDView relies on the excellent work of the open-source community. 

Detailed software credits, licenses, and specific versioned assets are itemized directly inside the application's "About" section, and here.

---

## License

MIT License. Copyright (c) 2026 The mdview authors. See [LICENSE](LICENSE).

## Third-Party Credits

mdview is built on the following third-party components, each under its own
license. Their license texts are redistributed in the corresponding `vendor/`
subdirectory and their attribution is displayed in the in-app Credits modal.

- [marked](https://marked.js.org/) (v18.0.9) - Markdown parser. Licensed under
  MIT. See `vendor/marked/LICENSE`.
- [DOMPurify](https://github.com/cure53/DOMPurify) (v3.4.13) - XSS sanitizer.
  Licensed under Apache 2.0 / MPL 2.0. See `vendor/DOMPurify/LICENSE`.
- [Font Awesome](https://fontawesome.com/) (Free v7.3.1) - Icons used as inline
  SVGs in the HTML. Licensed under CC BY 4.0 (icons), SIL OFL 1.1 (fonts), and
  MIT (code). See `vendor/fontawesome/LICENSE` and `vendor/fontawesome/README`.
- The Quick Guide text in the in-app guide modal is adapted from
  [The Markdown Guide](https://www.markdownguide.org) under
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
