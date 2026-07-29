/**
 * Resizable Drawer Utility
 * Allows users to resize the details panel by dragging the handle
 */

export function initResizableDrawer() {
  const sidebar = document.getElementById('sidebar');
  const dragHandle = document.querySelector('.sidebar-drag-handle');
  
  if (!sidebar || !dragHandle) return;

  let isResizing = false;
  let startY = 0;
  let startHeight = 0;
  const minHeight = 150; // Minimum height in pixels
  const maxHeightVh = 85; // Maximum height as percentage of viewport

  function getMaxHeight() {
    return (window.innerHeight * maxHeightVh) / 100;
  }

  function startResize(e) {
    isResizing = true;
    startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    
    // Get current height
    const currentHeight = sidebar.offsetHeight;
    startHeight = currentHeight;
    
    // Disable transitions during resize for smooth dragging
    sidebar.style.transition = 'none';
    
    // Add resizing class for visual feedback
    sidebar.classList.add('resizing');
    
    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    
    e.preventDefault();
  }

  function updateDrawerHeightVariable(height) {
    // Set CSS custom property for other elements to use
    document.documentElement.style.setProperty('--drawer-height', `${height}px`);
  }

  function resize(e) {
    if (!isResizing) return;
    
    const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    const deltaY = startY - currentY; // Positive when dragging up
    
    let newHeight = startHeight + deltaY;
    
    // Apply constraints
    const maxHeight = getMaxHeight();
    newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
    
    // Set the new height
    sidebar.style.height = `${newHeight}px`;
    
    // Update max-height for mobile
    if (window.innerWidth <= 600) {
      sidebar.style.maxHeight = `${newHeight}px`;
    }
    
    // Update CSS variable for button positioning
    updateDrawerHeightVariable(newHeight);
    
    e.preventDefault();
  }

  function stopResize() {
    if (!isResizing) return;
    
    isResizing = false;
    
    // Re-enable transitions
    sidebar.style.transition = '';
    
    // Remove resizing class
    sidebar.classList.remove('resizing');
    
    // Re-enable text selection
    document.body.style.userSelect = '';
    
    // Store the height preference in localStorage and update CSS variable
    try {
      const height = sidebar.offsetHeight;
      localStorage.setItem('sidebarHeight', height.toString());
      updateDrawerHeightVariable(height);
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  // Mouse events
  dragHandle.addEventListener('mousedown', startResize);
  document.addEventListener('mousemove', resize);
  document.addEventListener('mouseup', stopResize);

  // Touch events for mobile
  dragHandle.addEventListener('touchstart', startResize, { passive: false });
  document.addEventListener('touchmove', resize, { passive: false });
  document.addEventListener('touchend', stopResize);

  // Restore saved height on load
  try {
    const savedHeight = localStorage.getItem('sidebarHeight');
    if (savedHeight && sidebar.classList.contains('open')) {
      const height = parseInt(savedHeight, 10);
      if (height >= minHeight && height <= getMaxHeight()) {
        sidebar.style.height = `${height}px`;
        if (window.innerWidth <= 600) {
          sidebar.style.maxHeight = `${height}px`;
        }
        updateDrawerHeightVariable(height);
      }
    }
  } catch (e) {
    // Ignore localStorage errors
  }
  
  // Set initial height variable for buttons
  if (sidebar.classList.contains('open')) {
    updateDrawerHeightVariable(sidebar.offsetHeight);
  }

  // Reset height when sidebar is opened/closed
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        if (sidebar.classList.contains('open')) {
          // Restore saved height when opening
          try {
            const savedHeight = localStorage.getItem('sidebarHeight');
            if (savedHeight) {
              const height = parseInt(savedHeight, 10);
              if (height >= minHeight && height <= getMaxHeight()) {
                setTimeout(() => {
                  sidebar.style.height = `${height}px`;
                  if (window.innerWidth <= 600) {
                    sidebar.style.maxHeight = `${height}px`;
                  }
                  updateDrawerHeightVariable(height);
                }, 50); // Small delay to allow transition
              }
            } else {
              // No saved height, use current height
              setTimeout(() => {
                updateDrawerHeightVariable(sidebar.offsetHeight);
              }, 50);
            }
          } catch (e) {
            // Ignore localStorage errors
            setTimeout(() => {
              updateDrawerHeightVariable(sidebar.offsetHeight);
            }, 50);
          }
        }
      }
    });
  });

  observer.observe(sidebar, { attributes: true });

  // Handle window resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const currentHeight = sidebar.offsetHeight;
      const maxHeight = getMaxHeight();
      
      if (currentHeight > maxHeight) {
        sidebar.style.height = `${maxHeight}px`;
        if (window.innerWidth <= 600) {
          sidebar.style.maxHeight = `${maxHeight}px`;
        }
        updateDrawerHeightVariable(maxHeight);
      } else {
        updateDrawerHeightVariable(currentHeight);
      }
    }, 100);
  });
}

