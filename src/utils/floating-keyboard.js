/**
 * Floating Keyboard Module
 * Provides a mobile-friendly floating numeric keyboard for number inputs
 */

export class FloatingKeyboard {
  constructor() {
    this.keyboard = document.getElementById('floatingKeyboard');
    this.toggleButton = document.getElementById('toggleFloatingKeyboard');
    this.closeButton = document.getElementById('closeFloatingKeyboard');
    this.keys = this.keyboard.querySelectorAll('.floating-key');
    this.resizeHandle = this.keyboard.querySelector('.floating-keyboard-resize-handle');
    this.dragHandle = this.keyboard.querySelector('.floating-keyboard-header');
    
    this.currentInput = null;
    this.isKeyboardActive = false;
    this.isDragging = false;
    this.isResizing = false;
    this.startX = 0;
    this.startY = 0;
    this.startWidth = 0;
    this.startHeight = 0;
    this.startLeft = 0;
    this.startTop = 0;

    // Load saved preferences
    this.loadPreferences();
    
    this.init();
  }

  init() {
    // Key press handlers
    this.keys.forEach(key => {
      key.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleKeyPress(key.dataset.key);
      });
    });

    // Close button
    this.closeButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    });

    // Toggle button
    this.toggleButton.addEventListener('click', () => {
      this.toggle();
    });

    // Dragging functionality
    this.dragHandle.addEventListener('mousedown', (e) => this.startDrag(e));
    this.dragHandle.addEventListener('touchstart', (e) => this.startDrag(e));
    
    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('touchmove', (e) => this.drag(e));
    
    document.addEventListener('mouseup', () => this.stopDrag());
    document.addEventListener('touchend', () => this.stopDrag());

    // Resizing functionality
    this.resizeHandle.addEventListener('mousedown', (e) => this.startResize(e));
    this.resizeHandle.addEventListener('touchstart', (e) => this.startResize(e));
    
    document.addEventListener('mousemove', (e) => this.resize(e));
    document.addEventListener('touchmove', (e) => this.resize(e));
    
    document.addEventListener('mouseup', () => this.stopResize());
    document.addEventListener('touchend', () => this.stopResize());
  }

  handleKeyPress(key) {
    if (!this.currentInput) return;

    if (key === 'backspace') {
      // Backspace
      const value = this.currentInput.value;
      this.currentInput.value = value.slice(0, -1);
    } else {
      // Regular key (number or decimal point)
      const currentValue = this.currentInput.value;
      
      // Prevent multiple decimal points
      if (key === '.' && currentValue.includes('.')) {
        return;
      }
      
      const newValue = currentValue + key;
      
      // For type="number" inputs, we need to handle incomplete decimals (e.g., "3.")
      // by temporarily switching to text input mode
      if (this.currentInput.type === 'number') {
        const originalType = this.currentInput.type;
        this.currentInput.type = 'text';
        this.currentInput.value = newValue;
        
        // Switch back to number type after a brief delay
        setTimeout(() => {
          // Only switch back if the value is a valid number or empty
          if (newValue === '' || !isNaN(parseFloat(newValue))) {
            this.currentInput.type = originalType;
          }
        }, 10);
      } else {
        this.currentInput.value = newValue;
      }
    }

    // Trigger input event to update the app state
    const event = new Event('input', { bubbles: true });
    this.currentInput.dispatchEvent(event);
  }

  show(input) {
    this.currentInput = input;
    this.keyboard.style.display = 'flex';
    this.isKeyboardActive = true;
    
    // Update scale based on current dimensions
    const rect = this.keyboard.getBoundingClientRect();
    this.updateScale(rect.width, rect.height);
    
    // Add visual indicator to active input
    if (input) {
      input.classList.add('floating-keyboard-active');
    }
    
    // Hide native keyboard
    if (input) {
      input.setAttribute('readonly', 'readonly');
      input.blur();
      setTimeout(() => {
        input.removeAttribute('readonly');
      }, 100);
    }
  }

  // Switch to a new input while keeping keyboard open
  switchToInput(input) {
    if (!this.isKeyboardActive) {
      return;
    }
    
    // Remove visual indicator from previous input
    if (this.currentInput) {
      this.currentInput.classList.remove('floating-keyboard-active');
    }
    
    // Update current input
    this.currentInput = input;
    
    // Add visual indicator to new active input
    if (input) {
      input.classList.add('floating-keyboard-active');
    }
    
    // Prevent native keyboard from showing
    if (input) {
      input.setAttribute('readonly', 'readonly');
      input.blur();
      setTimeout(() => {
        input.removeAttribute('readonly');
      }, 100);
    }
  }

  hide() {
    this.keyboard.style.display = 'none';
    this.toggleButton.style.display = 'none';
    this.isKeyboardActive = false;
    
    // Remove visual indicator from current input
    if (this.currentInput) {
      this.currentInput.classList.remove('floating-keyboard-active');
    }
    
    this.currentInput = null;
    // Remove class indicating keyboard button is visible
    document.body.classList.remove('keyboard-button-visible');
  }

  toggle() {
    if (this.isKeyboardActive) {
      this.hide();
    } else if (this.currentInput) {
      this.show(this.currentInput);
    }
  }

  showToggleButton(input) {
    this.currentInput = input;
    this.toggleButton.style.display = 'flex';
    this.updateLabelText();
    // Add class indicating keyboard button is visible
    document.body.classList.add('keyboard-button-visible');
  }

  hideToggleButton() {
    if (!this.isKeyboardActive) {
      this.toggleButton.style.display = 'none';
      this.currentInput = null;
      // Remove class indicating keyboard button is visible
      document.body.classList.remove('keyboard-button-visible');
    }
  }

  // Dragging methods
  startDrag(e) {
    // Don't start dragging if clicking on the close button
    if (e.target.closest('#closeFloatingKeyboard')) {
      return;
    }
    
    this.isDragging = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const rect = this.keyboard.getBoundingClientRect();
    this.startX = clientX - rect.left;
    this.startY = clientY - rect.top;
    this.startLeft = rect.left;
    this.startTop = rect.top;
    
    e.preventDefault();
  }

  drag(e) {
    if (!this.isDragging) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const newLeft = clientX - this.startX;
    const newTop = clientY - this.startY;
    
    // Keep within viewport bounds
    const rect = this.keyboard.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;
    
    this.keyboard.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
    this.keyboard.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
    this.keyboard.style.right = 'auto';
    this.keyboard.style.bottom = 'auto';
    
    e.preventDefault();
  }

  stopDrag() {
    if (this.isDragging) {
      this.isDragging = false;
      this.savePreferences();
    }
  }

  // Resizing methods
  startResize(e) {
    this.isResizing = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const rect = this.keyboard.getBoundingClientRect();
    this.startX = clientX;
    this.startY = clientY;
    this.startWidth = rect.width;
    this.startHeight = rect.height;
    
    e.preventDefault();
    e.stopPropagation();
  }

  resize(e) {
    if (!this.isResizing) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - this.startX;
    const deltaY = clientY - this.startY;
    
    // Allow 3x smaller minimum size: 80px x 93px (down from 240px x 280px)
    const newWidth = Math.max(80, Math.min(this.startWidth + deltaX, window.innerWidth * 0.9));
    const newHeight = Math.max(93, Math.min(this.startHeight + deltaY, window.innerHeight * 0.8));
    
    this.keyboard.style.width = newWidth + 'px';
    this.keyboard.style.height = newHeight + 'px';
    
    // Update scaling based on size
    this.updateScale(newWidth, newHeight);
    
    e.preventDefault();
    e.stopPropagation();
  }

  stopResize() {
    if (this.isResizing) {
      this.isResizing = false;
      this.savePreferences();
    }
  }

  // Preferences persistence
  savePreferences() {
    const rect = this.keyboard.getBoundingClientRect();
    const preferences = {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    };
    localStorage.setItem('floatingKeyboard.preferences', JSON.stringify(preferences));
  }

  loadPreferences() {
    try {
      const saved = localStorage.getItem('floatingKeyboard.preferences');
      if (saved) {
        const preferences = JSON.parse(saved);
        
        // Apply saved dimensions if valid
        if (preferences.width && preferences.height) {
          this.keyboard.style.width = preferences.width + 'px';
          this.keyboard.style.height = preferences.height + 'px';
          // Update scale immediately
          this.updateScale(preferences.width, preferences.height);
        }
        
        // Apply saved position if valid
        if (preferences.left !== undefined && preferences.top !== undefined) {
          const maxLeft = window.innerWidth - preferences.width;
          const maxTop = window.innerHeight - preferences.height;
          
          if (preferences.left >= 0 && preferences.left <= maxLeft &&
              preferences.top >= 0 && preferences.top <= maxTop) {
            this.keyboard.style.left = preferences.left + 'px';
            this.keyboard.style.top = preferences.top + 'px';
            this.keyboard.style.right = 'auto';
            this.keyboard.style.bottom = 'auto';
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load floating keyboard preferences:', err);
    }
  }

  // Check if device is mobile/touch
  static isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
  }

  // Update label text (for i18n support)
  updateLabelText() {
    const labelElement = this.toggleButton.querySelector('.toggle-keyboard-label');
    if (labelElement && typeof window.t === 'function') {
      labelElement.textContent = window.t('floatingKeyboard');
    }
  }

  // Update scale based on keyboard dimensions
  updateScale(width, height) {
    // Base dimensions (default size)
    const baseWidth = 240;
    const baseHeight = 280;
    
    // Calculate scale factor (use the smaller of the two to maintain proportions)
    const widthScale = width / baseWidth;
    const heightScale = height / baseHeight;
    const scale = Math.min(widthScale, heightScale);
    
    // Apply CSS custom property for scaling
    this.keyboard.style.setProperty('--keyboard-scale', scale);
  }
}

// Export a function to attach the keyboard to numeric inputs
export function attachFloatingKeyboard(inputSelector = 'input[type="number"], input[inputmode="decimal"]') {
  // Only enable on mobile devices
  if (!FloatingKeyboard.isMobileDevice()) {
    return null;
  }

  const keyboard = new FloatingKeyboard();

  // Function to check if input is a numeric/decimal input
  const isNumericInput = (input) => {
    // Check input type
    if (input.type === 'number') return true;
    
    // Check inputmode attribute
    if (input.getAttribute('inputmode') === 'decimal') return true;
    
    // Check if pattern suggests numeric input
    const pattern = input.getAttribute('pattern');
    if (pattern && /\d|decimal|number/i.test(pattern)) return true;
    
    return false;
  };

  // Listen for focus on numeric inputs
  document.addEventListener('focusin', (e) => {
    const input = e.target;
    
    // Check if it's a numeric input
    if (input.tagName === 'INPUT' && isNumericInput(input)) {
      // If keyboard is already active, switch to new input without showing native keyboard
      if (keyboard.isKeyboardActive) {
        keyboard.switchToInput(input);
      } else {
        // Otherwise, show toggle button
        keyboard.showToggleButton(input);
      }
    }
  });

  // Listen for blur on numeric inputs
  document.addEventListener('focusout', (e) => {
    const input = e.target;
    
    if (input.tagName === 'INPUT' && isNumericInput(input)) {
      // Small delay to allow clicking on toggle button
      setTimeout(() => {
        keyboard.hideToggleButton();
      }, 200);
    }
  });

  // Listen for language changes to update label
  window.addEventListener('languagechange', () => {
    keyboard.updateLabelText();
  });

  // Also listen for custom language change event (if app uses it)
  document.addEventListener('appLanguageChanged', () => {
    keyboard.updateLabelText();
  });

  return keyboard;
}

