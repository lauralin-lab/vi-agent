# Quick Start Guide

## For LLM Integration

### 1. Provide Context to LLM

When asking the LLM to generate HTML, include:

```
Available files:
- template.html: Base template with callback system
- components/: 11 pre-built component examples
- system_prompt.md: Complete generation instructions

Task: [Describe what UI you need]

Generate complete HTML that:
- Uses callbacks for all interactions
- Follows the template.html structure
- Is responsive and supports dark mode
```

### 2. LLM Reads These Files

The LLM should read (in order):
1. `system_prompt.md` - Understand the system
2. `template.html` - Base structure
3. `components_guide.md` - Component patterns (if needed)
4. Relevant `components/*.html` - Examples (if applicable)

### 3. LLM Generates HTML

The LLM outputs complete HTML with:
- Callback functions on interactive elements
- Tailwind CSS styling
- Proper structure from template

### 4. App Displays HTML

Your app loads the HTML in a webview and:
- Registers callback listeners
- Handles user interactions
- Sends data back to LLM if needed

---

## Example Integration

### Python Example

```python
import json
from webview import create_window

# 1. Get HTML from LLM
prompt = """
Using the template.html file, create an HTML page that:
- Shows 3 product options
- Each option has a title, description, and price
- User can select one option
- Send callback when selected

Use the callback system with:
sendCallback('select', 'product_id', {name: 'Product', price: 99})
"""

html_content = llm.generate(prompt, files=[
    "static/system_prompt.md",
    "static/template.html"
])

# 2. Create callback handler
def handle_callback(callback_data):
    data = json.loads(callback_data)
    print(f"User selected: {data['value']}")
    # Send back to LLM or process
    
# 3. Display in webview
window = create_window('Products', html=html_content)
window.expose(handle_callback)
window.show()
```

### JavaScript/Electron Example

```javascript
const { BrowserWindow, ipcMain } = require('electron');

// 1. Get HTML from LLM
const html = await llm.generate({
    prompt: "Create a form to collect user's name and email...",
    files: [
        "static/system_prompt.md",
        "static/template.html"
    ]
});

// 2. Create window
const win = new BrowserWindow({
    webPreferences: {
        preload: 'preload.js'
    }
});

// 3. Handle callbacks
ipcMain.on('callback', (event, data) => {
    console.log('Callback received:', data);
    // Process or send to LLM
});

// 4. Load HTML
win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
```

### Swift/iOS Example

```swift
import WebKit

class ViewController: UIViewController, WKScriptMessageHandler {
    var webView: WKWebView!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // 1. Configure WebView
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "appCallback")
        
        webView = WKWebView(frame: view.bounds, configuration: config)
        view.addSubview(webView)
        
        // 2. Get HTML from LLM
        let html = llm.generate(prompt: "Create a selection interface...")
        
        // 3. Load HTML
        webView.loadHTMLString(html, baseURL: nil)
    }
    
    // 4. Handle callbacks
    func userContentController(_ userContentController: WKUserContentController,
                              didReceive message: WKScriptMessage) {
        if let callback = message.body as? [String: Any] {
            print("Callback:", callback)
            // Process or send to LLM
        }
    }
}
```

---

## Callback Data Structure

### Standard Format

```json
{
    "type": "action|select|input|request|close",
    "value": "identifier_or_value",
    "data": {
        "key": "additional context"
    },
    "timestamp": 1234567890
}
```

### Examples

**Button Click**:
```json
{
    "type": "action",
    "value": "submit_form",
    "data": {"form_name": "registration"},
    "timestamp": 1234567890
}
```

**Option Selected**:
```json
{
    "type": "select",
    "value": "option_2",
    "data": {"label": "Premium Plan", "price": 99},
    "timestamp": 1234567890
}
```

**Input Changed**:
```json
{
    "type": "input",
    "value": "email",
    "data": {"value": "user@example.com"},
    "timestamp": 1234567890
}
```

---

## Iterative Flow

### Multi-Turn Conversation

```
User → App → LLM: "Show me product options"
LLM → App → User: [HTML with 3 products]
User → App → LLM: [Callback: selected product_2]
LLM → App → User: [HTML with checkout form]
User → App → LLM: [Callback: form submitted]
LLM → App → User: [HTML with confirmation]
```

### Code Example

```python
# Initial request
html = llm.generate("Show 3 products", files=["static/system_prompt.md"])
display_html(html)

# User selects product
callback = wait_for_callback()  # {type: 'select', value: 'product_2', ...}

# Continue conversation
html = llm.generate(
    f"User selected {callback['value']}. Show checkout form.",
    files=["static/template.html"]
)
display_html(html)

# And so on...
```

---

## Tips

### For Better Results

1. **Be specific**: Tell LLM exactly what you need
2. **Reference components**: "Use pattern from products.html"
3. **Specify callbacks**: "Add callback that sends product ID"
4. **Request responsive**: "Make sure it works on mobile"
5. **Include data**: Pass data the LLM might need

### Common Patterns

**Options/Choices**:
```
Create HTML with 3-5 selectable cards.
Each card should call: sendCallback('select', 'id', {data})
```

**Forms**:
```
Create a form with [fields].
Each input should call: sendInput('field_name', value)
Add submit button that calls: sendCallback('action', 'submit', {})
```

**Confirmation**:
```
Create a confirmation dialog with message: [text]
Add Confirm button → sendCallback('action', 'confirm', {})
Add Cancel button → sendCallback('action', 'cancel', {})
```

---

## Testing

### 1. Test Callbacks

```javascript
// In browser console
sendCallback('action', 'test', {hello: 'world'})
// Should see in app's callback handler
```

### 2. Test Responsive

- Open browser dev tools
- Toggle device toolbar
- Test mobile/tablet/desktop sizes

### 3. Test Dark Mode

```javascript
// Toggle dark mode
document.documentElement.classList.toggle('dark')
```

---

## Troubleshooting

### Callbacks Not Working

- Check webview configuration
- Verify callback bridge is set up
- Test with console.log first
- Check for JavaScript errors

### Styling Issues

- Ensure Tailwind CDN is loaded
- Check for conflicting styles
- Verify dark mode classes
- Test in different browsers

### LLM Not Following Format

- Include more of system_prompt.md
- Show example from components/
- Be more explicit in prompt
- Validate generated HTML

---

## Next Steps

1. ✅ Read `system_prompt.md` completely
2. ✅ Review `components_guide.md` 
3. ✅ Test `template.html` in your app
4. ✅ Try generating simple HTML
5. ✅ Implement callback handling
6. ✅ Test full round-trip
7. ✅ Build your use case!

---

**Need Help?** Check:
- `system_prompt.md` - Complete AI instructions
- `components_guide.md` - Component reference
- `README.md` - Full documentation
- `components/*.html` - Working examples
