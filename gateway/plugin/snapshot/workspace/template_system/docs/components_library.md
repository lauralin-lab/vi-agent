# Component Library API Reference

**For AI Agents generating HTML webviews**

This JavaScript library provides pre-built components to minimize output tokens. Import with `<script src="/components.js"></script>` (already included in template.html).

## Quick Start

```javascript
const app = document.getElementById('app');
app.appendChild(Components.header('Title', 'Subtitle'));
app.appendChild(Components.text('Your content'));
app.appendChild(Components.button('Continue', 'next'));
```

---

## Component Functions

### 1. **Components.text(content, markdown)**
Display formatted text.
- `content` (string): Text to display
- `markdown` (boolean): Enable markdown formatting (default: false)

```javascript
Components.text('Welcome to the application')
Components.text('## Hello\nThis supports **markdown**', true)
```

---

### 2. **Components.code(language, code, showLineNumbers)**
Display syntax-highlighted code with copy button.
- `language` (string): Programming language (python, javascript, etc.)
- `code` (string): Code content
- `showLineNumbers` (boolean): Show line numbers (default: true)

```javascript
Components.code('python', 'def hello():\n    print("world")')
```

---

### 3. **Components.table(columns, data)**
Display tabular data.
- `columns` (array): Column definitions `[{header: 'Name', key: 'name'}]`
- `data` (array): Row objects `[{name: 'John', age: 30}]`

```javascript
Components.table(
    [{header: 'Name', key: 'name'}, {header: 'Age', key: 'age'}],
    [{name: 'Alice', age: 28}, {name: 'Bob', age: 32}]
)
```

---

### 4. **Components.option(id, title, description, data)**
Create selectable option card (triggers callback on click).
- `id` (string): Option identifier
- `title` (string): Option title
- `description` (string): Option description
- `data` (object): Additional data for callback (optional)

```javascript
Components.option('option1', 'First Choice', 'This is the description', {score: 100})
```

---

### 5. **Components.button(label, action, variant, data)**
Create action button (triggers callback on click).
- `label` (string): Button text
- `action` (string): Action identifier for callback
- `variant` (string): Style variant - 'primary', 'secondary', 'outline' (default: 'primary')
- `data` (object): Additional callback data (optional)

```javascript
Components.button('Submit', 'submit', 'primary', {formId: 'form1'})
Components.button('Cancel', 'cancel', 'outline')
```

---

### 6. **Components.input(id, label, type, placeholder)**
Create input field (triggers callback on change).
- `id` (string): Field identifier
- `label` (string): Field label
- `type` (string): Input type - 'text', 'email', 'password', 'number' (default: 'text')
- `placeholder` (string): Placeholder text (optional)

```javascript
Components.input('email', 'Email Address', 'email', 'Enter your email')
```

---

### 7. **Components.header(title, subtitle)**
Create page header section.
- `title` (string): Main heading
- `subtitle` (string): Subheading (optional)

```javascript
Components.header('Dashboard', 'View your analytics')
```

---

### 8. **Components.productCard(product)**
Create product display card (triggers callback on click).
- `product` (object): Product data `{id, name, price, image, description}`

```javascript
Components.productCard({
    id: 'prod1',
    name: 'Product Name',
    price: '$99.99',
    image: 'https://example.com/image.jpg',
    description: 'Product description'
})
```

---

### 9. **Components.alert(message, type)**
Display alert/notification box.
- `message` (string): Alert message
- `type` (string): Alert type - 'info', 'success', 'warning', 'error' (default: 'info')

```javascript
Components.alert('Operation successful!', 'success')
Components.alert('Error occurred', 'error')
```

---

### 10. **Components.loading(message)**
Display loading spinner with message.
- `message` (string): Loading text (default: 'Loading...')

```javascript
Components.loading('Processing your request...')
```

---

## Complete Example

**LLM Output (Minimal Tokens):**
```javascript
const app = document.getElementById('app');

// Header
app.appendChild(Components.header('Choose Payment Method', 'Select your preferred option'));

// Alert
app.appendChild(Components.alert('Your session expires in 5 minutes', 'warning'));

// Options
app.appendChild(Components.option('credit', 'Credit Card', 'Visa, Mastercard, Amex accepted'));
app.appendChild(Components.option('paypal', 'PayPal', 'Fast and secure payment'));
app.appendChild(Components.option('crypto', 'Cryptocurrency', 'Bitcoin, Ethereum supported'));

// Input
app.appendChild(Components.input('amount', 'Amount (USD)', 'number', '0.00'));

// Buttons
const btnContainer = document.createElement('div');
btnContainer.className = 'flex gap-3 mt-6';
btnContainer.appendChild(Components.button('Confirm', 'confirm', 'primary'));
btnContainer.appendChild(Components.button('Cancel', 'cancel', 'outline'));
app.appendChild(btnContainer);
```

**Result:** Full interactive UI with ~450 tokens instead of ~2000+ tokens for raw HTML.

---

## Token Savings

| Method | Approximate Tokens |
|--------|-------------------|
| Raw HTML (full component code) | 2000-5000 |
| Component Library (function calls) | 400-800 |
| **Savings** | **60-85%** |

---

## Callback Integration

Components automatically trigger callbacks using the existing callback system:
- **Buttons**: `sendCallback('action', action, data)`
- **Options**: `sendCallback('select', id, data)`
- **Inputs**: `sendInput(id, value)`

No need to manually wire up callbacks - already handled!

---

## Template Usage

1. Start from [template.html](template.html) (already includes components.js)
2. Use JavaScript to build UI with Component functions
3. All styling, interactivity, and callbacks handled automatically
4. Focus on logic, not HTML boilerplate

---

## Tips for LLMs

1. **Chain components efficiently**: Create all elements, append at end
2. **Group related elements**: Use container divs for layout
3. **Minimal variables**: Directly append when possible
4. **Leverage defaults**: Omit optional parameters when not needed
5. **Use semantic structure**: Header → Content → Actions

**Example optimization:**
```javascript
// Good (minimal)
app.appendChild(Components.text('Hello'));

// Avoid (unnecessary variable)
const textEl = Components.text('Hello');
app.appendChild(textEl);
```
