/**
 * Component Library for AI-Generated HTML
 * 
 * Import this script to use pre-built components with minimal code.
 * Usage: <script src="/components.js"></script>
 */

const Components = {
    
    /**
     * Display formatted text with optional markdown
     * @param {string} content - Text content
     * @param {boolean} markdown - Enable markdown rendering
     */
    text: function(content, markdown = false) {
        const container = document.createElement('div');
        container.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4';
        
        if (markdown) {
            // Simple markdown-like rendering
            content = content
                .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mb-2">$1</h3>')
                .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mb-3">$1</h2>')
                .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-4">$1</h1>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n\n/g, '</p><p class="mb-4">')
                .replace(/\n/g, '<br>');
            container.innerHTML = `<div class="prose dark:prose-invert max-w-none"><p class="mb-4">${content}</p></div>`;
        } else {
            container.innerHTML = `<p class="text-gray-700 dark:text-gray-300">${content}</p>`;
        }
        
        return container;
    },
    
    /**
     * Display syntax-highlighted code
     * @param {string} language - Programming language
     * @param {string} code - Code content
     * @param {boolean} showLineNumbers - Show line numbers
     */
    code: function(language, code, showLineNumbers = true) {
        const container = document.createElement('div');
        container.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4';
        
        const lines = code.split('\n');
        const lineNumbersHtml = showLineNumbers ? 
            `<div class="select-none text-gray-400 pr-4 border-r border-gray-200 dark:border-gray-700">
                ${lines.map((_, i) => `<div>${i + 1}</div>`).join('')}
            </div>` : '';
        
        container.innerHTML = `
            <div class="flex items-start mb-2">
                <div class="flex-1">
                    <div class="text-sm font-medium text-gray-600 dark:text-gray-400">${language}</div>
                </div>
                <button onclick="navigator.clipboard.writeText(\`${code.replace(/`/g, '\\`')}\`)" 
                        class="text-sm text-blue-600 hover:text-blue-700">
                    Copy
                </button>
            </div>
            <div class="flex">
                ${lineNumbersHtml}
                <pre class="flex-1 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto"><code class="language-${language}">${this._escapeHtml(code)}</code></pre>
            </div>
        `;
        
        return container;
    },
    
    /**
     * Display table with data
     * @param {Array} columns - Column definitions [{header: 'Name', key: 'name'}]
     * @param {Array} data - Row data
     */
    table: function(columns, data) {
        const container = document.createElement('div');
        container.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4';
        
        const headers = columns.map(col => 
            `<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">${col.header}</th>`
        ).join('');
        
        const rows = data.map(row => `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                ${columns.map(col => `<td class="px-4 py-3 text-gray-700 dark:text-gray-300">${row[col.key]}</td>`).join('')}
            </tr>
        `).join('');
        
        container.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <tr>${headers}</tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
        
        return container;
    },
    
    /**
     * Create selectable option card
     * @param {string} id - Option identifier
     * @param {string} title - Option title
     * @param {string} description - Option description
     * @param {object} data - Additional data to send in callback
     */
    option: function(id, title, description, data = {}) {
        const container = document.createElement('div');
        container.className = 'p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition-colors mb-3';
        container.onclick = () => sendCallback('select', id, { title, ...data });
        
        container.innerHTML = `
            <div class="font-medium text-gray-900 dark:text-white mb-1">${title}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">${description}</div>
        `;
        
        return container;
    },
    
    /**
     * Create button
     * @param {string} label - Button text
     * @param {string} action - Action identifier
     * @param {string} variant - Style variant (primary|secondary|outline)
     * @param {object} data - Additional callback data
     */
    button: function(label, action, variant = 'primary', data = {}) {
        const button = document.createElement('button');
        button.onclick = () => sendCallback('action', action, data);
        
        const variants = {
            primary: 'bg-blue-600 hover:bg-blue-700 text-white',
            secondary: 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white',
            outline: 'border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300'
        };
        
        button.className = `px-4 py-2 rounded-lg font-medium transition-colors ${variants[variant] || variants.primary}`;
        button.textContent = label;
        
        return button;
    },
    
    /**
     * Create input field
     * @param {string} id - Field identifier
     * @param {string} label - Field label
     * @param {string} type - Input type (text|email|password|number)
     * @param {string} placeholder - Placeholder text
     */
    input: function(id, label, type = 'text', placeholder = '') {
        const container = document.createElement('div');
        container.className = 'mb-4';
        
        container.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ${label}
            </label>
            <input 
                type="${type}"
                id="${id}"
                placeholder="${placeholder}"
                onchange="sendInput('${id}', this.value)"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
        `;
        
        return container;
    },
    
    /**
     * Create header section
     * @param {string} title - Header title
     * @param {string} subtitle - Header subtitle
     */
    header: function(title, subtitle = '') {
        const header = document.createElement('header');
        header.className = 'mb-8';
        
        header.innerHTML = `
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">${title}</h1>
            ${subtitle ? `<p class="text-gray-600 dark:text-gray-400">${subtitle}</p>` : ''}
        `;
        
        return header;
    },
    
    /**
     * Create product card
     * @param {object} product - Product data {id, name, price, image, description}
     */
    productCard: function(product) {
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer';
        card.onclick = () => sendCallback('select', product.id, product);
        
        card.innerHTML = `
            <img src="${product.image}" alt="${product.name}" class="w-full h-48 object-cover rounded-lg mb-4">
            <h3 class="font-semibold text-gray-900 dark:text-white mb-2">${product.name}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">${product.description || ''}</p>
            <div class="text-lg font-bold text-blue-600">${product.price}</div>
        `;
        
        return card;
    },
    
    /**
     * Create alert/message box
     * @param {string} message - Alert message
     * @param {string} type - Alert type (info|success|warning|error)
     */
    alert: function(message, type = 'info') {
        const alert = document.createElement('div');
        
        const styles = {
            info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
            success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
            warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200',
            error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
        };
        
        alert.className = `p-4 rounded-lg border mb-4 ${styles[type] || styles.info}`;
        alert.textContent = message;
        
        return alert;
    },
    
    /**
     * Create loading spinner
     * @param {string} message - Loading message
     */
    loading: function(message = 'Loading...') {
        const container = document.createElement('div');
        container.className = 'flex items-center justify-center p-8';
        
        container.innerHTML = `
            <div class="text-center">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
                <div class="text-gray-600 dark:text-gray-400">${message}</div>
            </div>
        `;
        
        return container;
    },
    
    // Helper function
    _escapeHtml: function(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Components;
}
