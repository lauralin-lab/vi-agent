# Component Reference Guide

Quick reference for all available HTML components. Use these as examples when building custom interfaces.

## Overview

All components are located in the `components/` directory. Each demonstrates a specific UI pattern with the callback system integrated.

---

## Text Display

### text.html
**Purpose**: Display formatted text content with optional markdown support

**Use Cases**:
- Show paragraphs of text
- Display formatted content
- Present markdown documents
- Show documentation or help text

**Key Features**:
- Markdown rendering
- Code syntax highlighting within text
- Responsive typography
- Dark mode support

**Example Usage**:
```html
<div class="prose dark:prose-invert max-w-none">
    <h1>Title</h1>
    <p>Your content here...</p>
</div>
```

---

## Code Display

### code.html
**Purpose**: Show syntax-highlighted code snippets

**Use Cases**:
- Display code examples
- Show API responses
- Present configuration files
- Technical documentation

**Key Features**:
- Multiple language support (Python, JavaScript, HTML, etc.)
- Line numbers
- Copy button
- Syntax highlighting

**Example Pattern**:
```html
<pre class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
    <code class="language-python">def hello():</code>
</pre>
```

---

## Visual Content

### image.html
**Purpose**: Display images with captions and metadata

**Use Cases**:
- Show photos or graphics
- Display charts/diagrams
- Present visual results
- Gallery views

**Key Features**:
- Responsive images
- Caption support
- Zoom capability
- Loading states

---

## Data Display

### table.html
**Purpose**: Present structured tabular data

**Use Cases**:
- Show data rows and columns
- Display reports
- Present comparisons
- List items with multiple attributes

**Key Features**:
- Sortable columns
- Responsive table layout
- Row hover effects
- Mobile-friendly scrolling

**Example Pattern**:
```html
<table class="w-full">
    <thead>
        <tr>
            <th class="px-4 py-2">Column 1</th>
            <th class="px-4 py-2">Column 2</th>
        </tr>
    </thead>
    <tbody>
        <tr onclick="sendCallback('select', 'row_1', {...})">
            <td class="px-4 py-2">Data 1</td>
            <td class="px-4 py-2">Data 2</td>
        </tr>
    </tbody>
</table>
```

---

## Interactive Components

### audio.html
**Purpose**: Audio playback interface with snippets

**Use Cases**:
- Play voice recordings
- Audio feedback
- Sound clips
- Podcast/music snippets

**Key Features**:
- Play/pause controls
- Multiple audio tracks
- Waveform visualization
- Progress indicator

---

### music.html
**Purpose**: Full-featured music player interface

**Use Cases**:
- Play music tracks
- Show playlists
- Album art display
- Audio controls

**Key Features**:
- Track progress
- Volume control
- Skip forward/back
- Playlist management

---

### map.html
**Purpose**: Display location with map interface

**Use Cases**:
- Show addresses
- Display locations
- Present geographic data
- Route information

**Key Features**:
- Address display
- Copy address button
- Open in maps app
- Marker placement

**Callback Example**:
```javascript
onclick="sendCallback('action', 'open_maps', {
    lat: 40.7128, 
    lng: -74.0060, 
    address: 'New York, NY'
})"
```

---

## Visualization

### mindmap.html
**Purpose**: Hierarchical mind map visualization

**Use Cases**:
- Show relationships
- Display hierarchies
- Present concept maps
- Organize ideas visually

**Key Features**:
- Interactive nodes
- Zoom/pan controls
- Drag and drop
- Node connections

---

### slides.html
**Purpose**: Presentation slide deck

**Use Cases**:
- Step-by-step presentations
- Tutorials
- Onboarding flows
- Multi-step explanations

**Key Features**:
- Navigation controls
- Progress indicator
- Image and text slides
- Full-screen mode

**Callback Example**:
```javascript
onclick="sendCallback('action', 'next_slide', {currentSlide: 2})"
```

---

## E-commerce

### products.html
**Purpose**: Product listing and cards

**Use Cases**:
- Show products for sale
- Display catalog items
- Present service offerings
- Comparison shopping

**Key Features**:
- Product cards
- Images and prices
- Add to cart callbacks
- Responsive grid layout

**Callback Example**:
```javascript
onclick="sendCallback('action', 'add_to_cart', {
    productId: '123',
    name: 'Product Name',
    price: 99.99
})"
```

---

## Utilities

### playground.html
**Purpose**: Interactive custom content area

**Use Cases**:
- Embed iframes
- Custom interactive elements
- Sandboxed content
- Third-party widgets

**Key Features**:
- Flexible container
- Iframe support
- Custom HTML content
- Isolation

---

## Common Patterns

### Option Selection Cards

Used across multiple components for presenting choices:

```html
<div 
    onclick="sendCallback('select', 'option_id', {label: 'Option Name'})"
    class="p-4 rounded-lg border border-gray-200 hover:border-blue-500 cursor-pointer transition-colors"
>
    <div class="font-medium text-gray-900 dark:text-white">Option Title</div>
    <div class="text-sm text-gray-600 dark:text-gray-400">Description</div>
</div>
```

### Action Buttons

Standard button patterns found in components:

```html
<!-- Primary Action -->
<button 
    onclick="sendCallback('action', 'confirm', {})"
    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
>
    Confirm
</button>

<!-- Secondary Action -->
<button 
    onclick="sendCallback('action', 'cancel', {})"
    class="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 rounded-lg"
>
    Cancel
</button>
```

### Input Fields

Form input patterns with callbacks:

```html
<input 
    type="text"
    placeholder="Enter value"
    onchange="sendInput('field_name', this.value)"
    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
/>
```

---

## Callback Reference

### Standard Callback Format

```javascript
{
    type: 'action|select|input|request|close',
    value: 'identifier_or_value',
    data: {
        // Additional context
    },
    timestamp: Date.now()
}
```

### Common Callback Types

| Type | Purpose | Example |
|------|---------|---------|
| `action` | User performed action | Button click, submit |
| `select` | User made selection | Choose option, pick item |
| `input` | User entered data | Text input, form field |
| `request` | Request data from app | Load more, refresh |
| `close` | Dismiss view | Close, cancel, back |

---

## Styling Guidelines

### Color System

- **Primary**: Blue (`bg-blue-600`, `text-blue-600`)
- **Success**: Green (`bg-green-600`)
- **Warning**: Yellow (`bg-yellow-600`)
- **Error**: Red (`bg-red-600`)
- **Neutral**: Gray (`bg-gray-50/100/200/...900`)

### Spacing

- Small: `p-2`, `m-2`, `gap-2`
- Medium: `p-4`, `m-4`, `gap-4`
- Large: `p-6`, `m-6`, `gap-6`
- Extra Large: `p-8`, `m-8`, `gap-8`

### Border Radius

- Small: `rounded` (0.25rem)
- Medium: `rounded-lg` (0.5rem)
- Large: `rounded-xl` (0.75rem)
- Full: `rounded-full` (9999px)

### Responsive Design

All components use Tailwind's responsive prefixes:
- `sm:` - Small screens (640px+)
- `md:` - Medium screens (768px+)
- `lg:` - Large screens (1024px+)
- `xl:` - Extra large (1280px+)

---

## Quick Start Checklist

When creating a new component:

1. ✅ Start from `template.html`
2. ✅ Add meaningful callbacks to all interactive elements
3. ✅ Include both light and dark mode styles
4. ✅ Make it responsive (test on mobile size)
5. ✅ Add loading/error states if needed
6. ✅ Keep JavaScript vanilla (no frameworks)
7. ✅ Test callbacks send correct data
8. ✅ Validate HTML structure

---

## Resources

- **Tailwind CSS Docs**: https://tailwindcss.com/docs
- **MDN Web Docs**: https://developer.mozilla.org/
- **Can I Use**: https://caniuse.com/ (check browser support)

---

## Need Help?

Refer to existing components for patterns and examples. All components follow the same structure and callback system, making it easy to mix and match elements.
