# Static HTML Components for AI-Generated Interfaces

This folder contains HTML components and templates for AI agents to generate interactive user interfaces.

## Purpose

This system enables LLMs to create interactive HTML webviews that:
- Display information to users
- Collect user input and selections  
- Send callbacks to the host application
- Provide consistent, professional UI/UX
- **Minimize output tokens using component library** (60-85% reduction)

## Structure

### Core Files

- **`template.html`** - Base template with callback system and component library. START HERE.
- **`components.js`** - JavaScript component library for minimal-token UI generation
- **`components_library.md`** - Complete API reference for component library (RECOMMENDED)
- **`system_prompt.md`** - Complete instructions for AI agents
- **`components_guide.md`** - Reference for manual HTML patterns
- **`index.html`** - Component showcase homepage

### Component Library

**NEW: Token-Efficient Approach**

The `components.js` library provides pre-built UI functions that drastically reduce LLM output tokens.

**Example - Traditional HTML (2000+ tokens):**
```html
<div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border...">
    <button class="px-4 py-2 bg-blue-600 hover:bg-blue-700..." onclick="...">
        Submit
    </button>
</div>
```

**Example - Component Library (50 tokens):**
```javascript
app.appendChild(Components.button('Submit', 'submit'));
```

**Token Savings: 60-85%** - Same result, fraction of the output!

See [components_library.md](components_library.md) for complete API.

### HTML Examples (`components/` folder)

Reference implementations for custom components:

1. **text.html** - Formatted text and markdown display
2. **code.html** - Syntax-highlighted code snippets  
3. **image.html** - Image display with captions
4. **table.html** - Tabular data presentation
5. **audio.html** - Audio playback interface
6. **music.html** - Full music player
7. **map.html** - Location/map display
8. **mindmap.html** - Visual mind map
9. **slides.html** - Presentation slides
10. **products.html** - Product cards/listings
11. **playground.html** - Custom interactive areas
12. **library_demo.html** - Example using component library

### Supporting Assets (`_next/` folder)

Next.js static assets (CSS, JS, fonts) - automatically generated, no manual editing needed.

## For AI Agents

### Quick Start (Recommended Method)

1. **Read** `components_library.md` for component API reference
2. **Start from** `template.html` (includes `components.js`)
3. **Build UI** using `Components.function()` calls
4. **Save 60-85% tokens** compared to raw HTML

**Minimal Example:**
```javascript
const app = document.getElementById('app');
app.appendChild(Components.header('Welcome', 'Choose an option'));
app.appendChild(Components.option('opt1', 'First', 'Description'));
app.appendChild(Components.button('Continue', 'next'));
```

### Alternative: Manual HTML

For custom components not in library:
1. **Read** `system_prompt.md` for complete instructions  
2. **Reference** `components/` folder for examples
3. **Follow** patterns in `components_guide.md`

### Callback System

Component library handles callbacks automatically. For manual HTML:

```javascript
// Send callbacks to the app
sendCallback(type, value, data)

// Types: 'action', 'select', 'input', 'request', 'close'
```

**Example**:
```html
<button onclick="sendCallback('action', 'confirm', {})">
    Confirm
</button>
```

### Key Principles

- ✅ **PREFER component library** for token efficiency
- ✅ Use `template.html` as starting point
- ✅ Component functions auto-handle callbacks
- ✅ Keep styling consistent with Tailwind classes
- ✅ Support both light and dark modes
- ✅ Make responsive (mobile-first)
- ✅ Use vanilla JavaScript only (no frameworks)

## For Developers

### Hosting (FastAPI Example)

**Serve static files via FastAPI:**

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI()

# Mount static folder
app.mount("/static", StaticFiles(directory="apps/template_system/static"), name="static")

# Serve components.js at root for easy access
@app.get("/components.js")
async def get_components_js():
    return FileResponse("apps/template_system/static/components.js")

# Example: LLM generates HTML, returns URL
@app.post("/generate-view")
async def generate_view(prompt: str):
    # Your LLM generates HTML using component library
    generated_html = llm.generate(prompt)
    
    # Save to static folder
    filename = f"generated_{uuid.uuid4()}.html"
    with open(f"apps/template_system/static/{filename}", "w") as f:
        f.write(generated_html)
    
    # Return URL for webview
    return {"url": f"http://your-domain.com/static/{filename}"}
```

**Access components:**
- Template: `http://your-domain.com/static/template.html`
- Library: `http://your-domain.com/components.js`
- Examples: `http://your-domain.com/static/components/library_demo.html`

### Alternative Hosting

#### Simple HTTP Server (Python)
```bash
cd static
python -m http.server 8000
```
Visit: http://localhost:8000

#### Using nginx
Point your nginx `root` directive to this folder.

#### Static hosting platforms
Upload this folder to:
- Vercel
- Netlify  
- GitHub Pages
- Google Cloud Storage
- Any CDN or static file host

### Integrating with Native Apps

#### iOS (WKWebView)
```swift
// Register callback handler
webView.configuration.userContentController.add(self, name: "appCallback")

// Handle callbacks
func userContentController(_ userContentController: WKUserContentController, 
                          didReceive message: WKScriptMessage) {
    if let callback = message.body as? [String: Any] {
        // Process callback
    }
}
```

#### Android (WebView)
```java
webView.addJavascriptInterface(new Object() {
    @JavascriptInterface
    public void callback(String json) {
        // Process callback
    }
}, "AndroidBridge");
```

#### Electron
```javascript
// Preload script
contextBridge.exposeInMainWorld('electronAPI', {
    callback: (data) => ipcRenderer.send('callback', data)
});
```

## Workflow

### AI Agent Workflow

1. **Receive user request** from application
2. **Read** system_prompt.md for context
3. **Choose** template.html or existing component
4. **Generate/modify** HTML with appropriate callbacks
5. **Return** complete HTML to application
6. **Respond to callbacks** from user interactions

### Application Workflow

1. **Send context** to AI agent
2. **Receive HTML** from agent
3. **Display** in webview
4. **Listen for callbacks** from user interactions
5. **Send callback data** back to AI agent
6. **Repeat** until task complete

## File Organization

```
static/
├── template.html           # Base template (start here)
├── system_prompt.md        # AI instructions
├── components_guide.md     # Component reference
├── index.html             # Showcase homepage
├── README.md              # This file
├── components/            # Example components
│   ├── text.html
│   ├── code.html
│   ├── image.html
│   ├── table.html
│   ├── audio.html
│   ├── music.html
│   ├── map.html
│   ├── mindmap.html
│   ├── slides.html
│   ├── products.html
│   └── playground.html
└── _next/                 # Static assets (auto-generated)
    ├── static/
    │   ├── chunks/
    │   ├── css/
    │   └── media/
    └── ...
```

## Features

All components support:
- ✅ Responsive design (mobile to desktop)
- ✅ Dark mode
- ✅ Interactive elements with callbacks
- ✅ Tailwind CSS styling
- ✅ Framer Motion animations
- ✅ Zero server-side dependencies
- ✅ Fast loading and rendering

## Customization

### For AI Agents
Follow patterns in `system_prompt.md` and reference `components_guide.md`

### For Developers
- Modify `template.html` to change base structure
- Update `system_prompt.md` to refine AI behavior
- Add new components to `components/` folder
- Update this README with new patterns

## Support

For questions or issues:
1. Check `system_prompt.md` for AI generation guidelines
2. Review `components_guide.md` for component patterns  
3. Examine existing components in `components/` folder
4. Test callbacks work correctly in your integration

---

**Version**: 1.0  
**Last Updated**: January 2026  
**Framework**: Next.js 14 (Static Export)  
**Styling**: Tailwind CSS  
**Target**: AI-Generated Interactive Interfaces
