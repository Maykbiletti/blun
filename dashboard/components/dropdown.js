// Dropdown Component - Reusable with auto-flip positioning & keyboard nav
// Usage: const dropdown = createDropdown(trigger, items, options)

let activeDropdown = null;

function createDropdown(trigger, items, options = {}) {
    const dropdown = {
        trigger,
        container: null,
        menu: null,
        isOpen: false,
        selectedIndex: -1,
        options: {
            position: 'bottom-left', // bottom-left, bottom-right, top-left, top-right
            autoFlip: true,
            className: '',
            ...options
        }
    };

    // Create dropdown HTML
    function createDropdownHTML() {
        const container = document.createElement('div');
        container.className = 'dropdown-container relative inline-block';

        const menu = document.createElement('div');
        menu.className = `dropdown-menu absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-48 ${dropdown.options.className}`;
        menu.style.display = 'none';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-hidden', 'true');

        const list = document.createElement('ul');
        list.className = 'py-1';
        list.setAttribute('role', 'none');

        items.forEach((item, index) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'none');

            const button = document.createElement('button');
            button.className = 'dropdown-item w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none transition-colors';
            button.setAttribute('role', 'menuitem');
            button.setAttribute('tabindex', '-1');
            button.style.minHeight = '44px'; // Touch target

            if (typeof item === 'string') {
                button.textContent = item;
                button.addEventListener('click', () => {
                    console.log('Dropdown item clicked:', item);
                    close();
                });
            } else {
                button.textContent = item.label;
                button.addEventListener('click', () => {
                    if (item.action) item.action();
                    close();
                });

                if (item.icon) {
                    const icon = document.createElement('span');
                    icon.className = 'inline-block w-4 h-4 mr-2';
                    icon.innerHTML = item.icon;
                    button.insertBefore(icon, button.firstChild);
                }

                if (item.disabled) {
                    button.disabled = true;
                    button.className += ' opacity-50 cursor-not-allowed';
                }
            }

            li.appendChild(button);
            list.appendChild(li);
        });

        menu.appendChild(list);
        container.appendChild(menu);

        dropdown.container = container;
        dropdown.menu = menu;

        return container;
    }

    // Position dropdown with auto-flip
    function position() {
        if (!dropdown.menu) return;

        const triggerRect = dropdown.trigger.getBoundingClientRect();
        const menuRect = dropdown.menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let top = 0;
        let left = 0;
        let position = dropdown.options.position;

        // Auto-flip logic
        if (dropdown.options.autoFlip) {
            const spaceBelow = viewportHeight - triggerRect.bottom;
            const spaceAbove = triggerRect.top;
            const spaceRight = viewportWidth - triggerRect.left;
            const spaceLeft = triggerRect.right;

            // Vertical flip
            if (position.includes('bottom') && spaceBelow < menuRect.height && spaceAbove > menuRect.height) {
                position = position.replace('bottom', 'top');
            } else if (position.includes('top') && spaceAbove < menuRect.height && spaceBelow > menuRect.height) {
                position = position.replace('top', 'bottom');
            }

            // Horizontal flip
            if (position.includes('left') && spaceRight < menuRect.width && spaceLeft > menuRect.width) {
                position = position.replace('left', 'right');
            } else if (position.includes('right') && spaceLeft < menuRect.width && spaceRight > menuRect.width) {
                position = position.replace('right', 'left');
            }
        }

        // Calculate position
        switch (position) {
            case 'bottom-left':
                top = triggerRect.bottom + 2;
                left = triggerRect.left;
                break;
            case 'bottom-right':
                top = triggerRect.bottom + 2;
                left = triggerRect.right - menuRect.width;
                break;
            case 'top-left':
                top = triggerRect.top - menuRect.height - 2;
                left = triggerRect.left;
                break;
            case 'top-right':
                top = triggerRect.top - menuRect.height - 2;
                left = triggerRect.right - menuRect.width;
                break;
        }

        // Ensure menu stays within viewport
        left = Math.max(8, Math.min(left, viewportWidth - menuRect.width - 8));
        top = Math.max(8, Math.min(top, viewportHeight - menuRect.height - 8));

        dropdown.menu.style.top = `${top}px`;
        dropdown.menu.style.left = `${left}px`;
        dropdown.menu.style.position = 'fixed';
    }

    // Keyboard navigation
    function handleKeydown(e) {
        if (!dropdown.isOpen) return;

        const items = dropdown.menu.querySelectorAll('.dropdown-item:not([disabled])');

        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                close();
                dropdown.trigger.focus();
                break;

            case 'ArrowDown':
                e.preventDefault();
                dropdown.selectedIndex = Math.min(dropdown.selectedIndex + 1, items.length - 1);
                updateSelection(items);
                break;

            case 'ArrowUp':
                e.preventDefault();
                dropdown.selectedIndex = Math.max(dropdown.selectedIndex - 1, 0);
                updateSelection(items);
                break;

            case 'Enter':
            case ' ':
                e.preventDefault();
                if (dropdown.selectedIndex >= 0 && items[dropdown.selectedIndex]) {
                    items[dropdown.selectedIndex].click();
                }
                break;

            case 'Home':
                e.preventDefault();
                dropdown.selectedIndex = 0;
                updateSelection(items);
                break;

            case 'End':
                e.preventDefault();
                dropdown.selectedIndex = items.length - 1;
                updateSelection(items);
                break;
        }
    }

    function updateSelection(items) {
        items.forEach((item, index) => {
            item.setAttribute('tabindex', index === dropdown.selectedIndex ? '0' : '-1');
            if (index === dropdown.selectedIndex) {
                item.focus();
            }
        });
    }

    function open() {
        if (dropdown.isOpen) return;

        // Close any other open dropdown
        if (activeDropdown && activeDropdown !== dropdown) {
            activeDropdown.close();
        }

        dropdown.isOpen = true;
        activeDropdown = dropdown;
        dropdown.selectedIndex = -1;

        // Show menu
        dropdown.menu.style.display = 'block';
        dropdown.menu.setAttribute('aria-hidden', 'false');
        dropdown.trigger.setAttribute('aria-expanded', 'true');

        // Position after display to get correct dimensions
        setTimeout(position, 0);

        // Focus first item
        const firstItem = dropdown.menu.querySelector('.dropdown-item:not([disabled])');
        if (firstItem) {
            dropdown.selectedIndex = 0;
            firstItem.setAttribute('tabindex', '0');
            firstItem.focus();
        }

        // Event listeners
        document.addEventListener('keydown', handleKeydown);
        document.addEventListener('click', handleClickOutside);
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position);
    }

    function close() {
        if (!dropdown.isOpen) return;

        dropdown.isOpen = false;
        activeDropdown = null;
        dropdown.selectedIndex = -1;

        // Hide menu
        dropdown.menu.style.display = 'none';
        dropdown.menu.setAttribute('aria-hidden', 'true');
        dropdown.trigger.setAttribute('aria-expanded', 'false');

        // Remove event listeners
        document.removeEventListener('keydown', handleKeydown);
        document.removeEventListener('click', handleClickOutside);
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position);
    }

    function toggle() {
        if (dropdown.isOpen) {
            close();
        } else {
            open();
        }
    }

    function handleClickOutside(e) {
        if (!dropdown.container.contains(e.target) && !dropdown.trigger.contains(e.target)) {
            close();
        }
    }

    // Setup trigger
    dropdown.trigger.setAttribute('aria-expanded', 'false');
    dropdown.trigger.setAttribute('aria-haspopup', 'true');
    dropdown.trigger.addEventListener('click', toggle);

    // Create dropdown HTML and insert after trigger
    const dropdownElement = createDropdownHTML();
    dropdown.trigger.parentNode.insertBefore(dropdownElement, dropdown.trigger.nextSibling);

    // Return API
    return {
        open,
        close,
        toggle,
        destroy() {
            close();
            dropdown.trigger.removeEventListener('click', toggle);
            if (dropdown.container && dropdown.container.parentNode) {
                dropdown.container.parentNode.removeChild(dropdown.container);
            }
        }
    };
}

// Utility function for quick dropdown creation
function createSimpleDropdown(triggerSelector, items, options = {}) {
    const trigger = document.querySelector(triggerSelector);
    if (!trigger) {
        console.error('Dropdown trigger not found:', triggerSelector);
        return null;
    }
    return createDropdown(trigger, items, options);
}

// Export for use in other components
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createDropdown, createSimpleDropdown };
} else if (typeof window !== 'undefined') {
    window.DropdownComponent = { createDropdown, createSimpleDropdown };
}