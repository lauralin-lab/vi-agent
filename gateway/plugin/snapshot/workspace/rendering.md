# Rendering Reference

This document is the reference for generating all output components — including text, images, tables, code blocks, interactive elements, and full-page webviews. All generated output should follow the format and guidelines described here.

## Code Generation Method

**PREFERRED: Use Component Library (Minimal Tokens)**

The template includes a JavaScript component library (`components.js`) that drastically reduces output tokens. Instead of writing full HTML, call pre-built component functions.

**Template includes:**
```html
<script src="/components.js"></script>
```

**Build UI with JavaScript:**
```javascript
const app = document.getElementById('app');
app.appendChild(Components.header('Title', 'Subtitle'));
app.appendChild(Components.text('Content here'));
app.appendChild(Components.button('Action', 'action_id'));
```

See [components_library.md](components_library.md) for complete API reference.

**Token Savings: 60-85% reduction** (400-800 tokens vs 2000-5000 tokens)

---

## Alternative: Manual HTML (More Tokens)

If you need custom components not in the library, you can write raw HTML. Reference examples in `components/` folder.

---

## Available Resources

### Template Files
- **`template_system/static/template.html`**: Base template with callback system and component library
- **`template_system/docs/components_library.md`**: Component library API reference (RECOMMENDED)
- **`template_system/static/components.js`**: The component library JavaScript source
- **`template_system/static/index.html`**: Library demo / showcase page
- **`template_system/docs/components_guide.md`**: Detailed component usage guide

### Component Library Functions
1. **Components.text(content, markdown)** - Display formatted text
2. **Components.code(language, code, showLineNumbers)** - Syntax-highlighted code
3. **Components.table(columns, data)** - Tabular data
4. **Components.option(id, title, description, data)** - Selectable option card
5. **Components.button(label, action, variant, data)** - Action button
6. **Components.input(id, label, type, placeholder)** - Input field
7. **Components.header(title, subtitle)** - Page header
8. **Components.productCard(product)** - Product display
9. **Components.alert(message, type)** - Alert/notification
10. **Components.loading(message)** - Loading spinner

### Component Demo Pages (`template_system/src/app/demos/`)
- **`audio/page.tsx`**, **`code/page.tsx`**, **`image/page.tsx`**, **`table/page.tsx`**
- **`music/page.tsx`**, **`map/page.tsx`**, **`mindmap/page.tsx`**
- **`slides/page.tsx`**, **`products/page.tsx`**, **`playground/page.tsx`**, **`text/page.tsx`**

### Output Component Implementations (`template_system/src/components/output-design-system/`)
- **`TextOutput.tsx`**, **`CodeOutput.tsx`**, **`ImageOutput.tsx`**, **`TableOutput.tsx`**
- **`AudioOutput.tsx`**, **`MusicPlayerOutput.tsx`**, **`MapOutput.tsx`**, **`MindMapOutput.tsx`**
- **`SlideDeckOutput.tsx`**, **`ProductListOutput.tsx`**, **`InteractivePlaygroundOutput.tsx`**

## Callback System

### Standard Functions Available

```javascript
// Send an action callback
sendCallback('action', 'action_name', {key: 'value'})

// Send a selection callback
sendCallback('select', 'option_id', {label: 'Option Name', ...})

// Send input data
sendInput('field_name', value)

// Request data from app
requestData('data_type')

// Close the view
closeView()
```

**Note:** Component library functions automatically call these callbacks - no manual wiring needed!

### Callback Types
- **action**: User performed an action (button click, etc.)
- **select**: User made a selection from options
- **input**: User entered text/data
- **request**: Request data from the app/LLM
- **close**: Dismiss the current view
- **navigate**: Request navigation to another view

## Guidelines

### 1. Start from Template
- Always base HTML on `template.html`
- Keep the callback system intact
- Use the provided Tailwind CSS CDN (already included)

### 2. Design Principles
- **Mobile-first**: Responsive design that works on all screen sizes
- **Dark mode support**: Automatically handled by component library
- **Clear hierarchy**: Obvious buttons, clear CTAs
- **Accessible**: Good contrast, clear labels, proper semantics

### 3. Component Library Usage (RECOMMENDED)

**Always prefer component library over manual HTML to save 60-85% tokens.**

#### Basic Pattern
```javascript
const app = document.getElementById('app');

// Add components by calling functions
app.appendChild(Components.header('Page Title', 'Optional subtitle'));
app.appendChild(Components.text('Your content here'));
app.appendChild(Components.button('Submit', 'action_id'));
```

#### For Options/Choices
```javascript
// Create selectable option cards (callbacks automatic)
app.appendChild(Components.option('option1', 'First Choice', 'Description here', {extra: 'data'}));
app.appendChild(Components.option('option2', 'Second Choice', 'Another option', {value: 2}));
```

#### For Actions
```javascript
// Buttons with automatic callback handling
app.appendChild(Components.button('Continue', 'continue_action', 'primary'));
app.appendChild(Components.button('Cancel', 'cancel_action', 'outline'));
```

#### For Input
```javascript
// Input fields with automatic sendInput() on change
app.appendChild(Components.input('user_name', 'Your Name', 'text', 'Enter name'));
app.appendChild(Components.input('email', 'Email Address', 'email', 'you@example.com'));
```

#### For Data Display
```javascript
// Tables
app.appendChild(Components.table(
    [{header: 'Name', key: 'name'}, {header: 'Value', key: 'value'}],
    [{name: 'Item 1', value: '$10'}, {name: 'Item 2', value: '$20'}]
));

// Code blocks
app.appendChild(Components.code('python', 'def hello():\n    print("world")'));

// Alerts
app.appendChild(Components.alert('Success message', 'success'));
```

#### Complex Layouts
```javascript
// Group related elements in containers
const container = document.createElement('div');
container.className = 'space-y-4';
container.appendChild(Components.text('Select your preferences:'));
container.appendChild(Components.option('opt1', 'Option 1', 'Description'));
container.appendChild(Components.option('opt2', 'Option 2', 'Description'));
app.appendChild(container);

// Button groups
const btnGroup = document.createElement('div');
btnGroup.className = 'flex gap-3 mt-6';
btnGroup.appendChild(Components.button('Save', 'save', 'primary'));
btnGroup.appendChild(Components.button('Cancel', 'cancel', 'outline'));
app.appendChild(btnGroup);
```

### 4. Manual HTML (Only if component unavailable)

Use manual HTML only for custom components not available in the library.

#### Card Container
```html
<div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
    <!-- content -->
</div>
```

#### Manual Button (avoid - use Components.button() instead)
```html
<button onclick="sendCallback('action', 'confirm', {})"
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
    Confirm
</button>
```

## Output Format

### When Creating New HTML (Use Component Library)

**Preferred approach (saves 60-85% tokens):**
```javascript
const app = document.getElementById('app');
app.appendChild(Components.header('Title', 'Subtitle'));
app.appendChild(Components.text('Content'));
app.appendChild(Components.button('Action', 'action_id'));
```

**Only use full HTML if you need custom components not in library.**

### Structure
1. Get reference to app container: `const app = document.getElementById('app');`
2. Build UI by appending components: `app.appendChild(Components.xxx(...))`
3. All callbacks handled automatically by components
4. No need to wire up onclick handlers manually

## Examples

### Example 1: Present Options
**Task**: Show user 3 service tier options

```javascript
const app = document.getElementById('app');

app.appendChild(Components.header('Choose Your Plan', 'Select the best option for you'));

app.appendChild(Components.option('basic', 'Basic Plan', '$9.99/month - Essential features', {price: 9.99}));
app.appendChild(Components.option('pro', 'Pro Plan', '$19.99/month - All features', {price: 19.99}));
app.appendChild(Components.option('enterprise', 'Enterprise', '$49.99/month - Priority support', {price: 49.99}));

const actions = document.createElement('div');
actions.className = 'flex gap-3 mt-6';
actions.appendChild(Components.button('Continue', 'select_plan', 'primary'));
actions.appendChild(Components.button('Cancel', 'cancel', 'outline'));
app.appendChild(actions);
```

### Example 2: Collect Input
**Task**: Get user's name and email

```javascript
const app = document.getElementById('app');

app.appendChild(Components.header('Your Information', 'Please provide your details'));
app.appendChild(Components.input('name', 'Full Name', 'text', 'John Doe'));
app.appendChild(Components.input('email', 'Email Address', 'email', 'john@example.com'));
app.appendChild(Components.button('Submit', 'submit_form', 'primary'));
```

### Example 3: Display Results
**Task**: Show analysis results in table

```javascript
const app = document.getElementById('app');

app.appendChild(Components.header('Analysis Results', 'Summary of findings'));

app.appendChild(Components.table(
    [{header: 'Metric', key: 'metric'}, {header: 'Value', key: 'value'}, {header: 'Status', key: 'status'}],
    [
        {metric: 'Performance', value: '95%', status: 'Excellent'},
        {metric: 'Reliability', value: '88%', status: 'Good'},
        {metric: 'Security', value: '92%', status: 'Very Good'}
    ]
));

app.appendChild(Components.button('Download Report', 'download', 'primary'));
```

### Example 4: Confirmation Dialog
**Task**: Ask user to confirm an action

```javascript
const app = document.getElementById('app');

app.appendChild(Components.header('Confirm Action', 'Are you sure?'));
app.appendChild(Components.alert('This action cannot be undone.', 'warning'));
app.appendChild(Components.text('Please confirm that you want to proceed with this operation.'));

const actions = document.createElement('div');
actions.className = 'flex gap-3 mt-6';
actions.appendChild(Components.button('Yes, Continue', 'confirm', 'primary'));
actions.appendChild(Components.button('Cancel', 'cancel', 'outline'));
app.appendChild(actions);
```

## Best Practices

1. **Always use component library first** - Check components_library.md for available components
2. **Minimal code** - Use component functions instead of writing HTML
3. **Provide visual feedback** - Components handle hover states automatically
4. **Handle loading states** - Use Components.loading() while waiting
5. **Error handling** - Use Components.alert() for errors
6. **Accessibility** - Components have built-in accessibility
7. **Performance** - Component library is cached and fast
8. **Consistency** - All components use the same design language

## Constraints

- **Use component library whenever possible** - Saves 60-85% tokens
- Use only vanilla JavaScript (no frameworks like React, Vue)
- Components.js is already loaded via `<script src="/components.js"></script>`
- Use Tailwind CSS via CDN (already included in template)
- Keep code concise - let components handle styling and callbacks
- Ensure works on mobile and desktop screens (components are responsive)
