document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // 1. Interactive Phone Mockup Logic
  const phoneNavItems = document.querySelectorAll('.phone-nav-bar .nav-item');
  const phoneScreens = document.querySelectorAll('.phone-screen-content');
  const mockupNavBtns = document.querySelectorAll('.mockup-sidebar .mockup-nav-btn');

  function switchPhoneScreen(screenId) {
    // Update phone nav items active state
    phoneNavItems.forEach(item => {
      if (item.getAttribute('data-nav-screen') === screenId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update outer mockup sidebar active state
    mockupNavBtns.forEach(btn => {
      if (btn.getAttribute('data-screen') === screenId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Display correct screen
    phoneScreens.forEach(screen => {
      if (screen.id === `phone-screen-${screenId}`) {
        screen.classList.add('active');
      } else {
        screen.classList.remove('active');
      }
    });
  }

  phoneNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const screenId = item.getAttribute('data-nav-screen');
      switchPhoneScreen(screenId);
    });
  });

  mockupNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const screenId = btn.getAttribute('data-screen');
      switchPhoneScreen(screenId);
    });
  });

  // FAB Menu toggle
  const phoneFab = document.getElementById('phone-fab');
  if (phoneFab) {
    const fabBtn = phoneFab.querySelector('.phone-fab-btn');
    const fabMenu = phoneFab.querySelector('.fab-menu-overlay');

    fabBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fabBtn.classList.toggle('open');
      fabMenu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      fabBtn.classList.remove('open');
      fabMenu.classList.remove('show');
    });
  }

  // Bell Notification Dialog Popup
  const phoneBellBtn = document.getElementById('phone-bell-btn');
  const bellPopup = document.getElementById('bell-popup');
  const closeBellPopup = document.getElementById('close-bell-popup');

  if (phoneBellBtn && bellPopup) {
    phoneBellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      bellPopup.classList.add('show');
    });
    
    closeBellPopup.addEventListener('click', (e) => {
      e.stopPropagation();
      bellPopup.classList.remove('show');
    });
  }


  // 2. Database SQL Tab Switching Logic
  const dbTabs = document.querySelectorAll('.db-tabs .db-tab-btn');
  const dbCodes = document.querySelectorAll('.db-content-viewer .db-table-code');

  dbTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      dbTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetTable = tab.getAttribute('data-table');
      dbCodes.forEach(code => {
        if (code.id === `db-table-${targetTable}`) {
          code.classList.add('active');
        } else {
          code.classList.remove('active');
        }
      });
    });
  });


  // 3. Copy to Clipboard Functionality
  const copyBtns = document.querySelectorAll('.copy-code-btn');
  
  copyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const textToCopy = btn.getAttribute('data-clipboard');
      
      navigator.clipboard.writeText(textToCopy).then(() => {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="check"></i> Tersalin!`;
        btn.style.borderColor = 'var(--color-success)';
        btn.style.color = '#fff';
        lucide.createIcons();

        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.style.borderColor = '';
          btn.style.color = '';
          lucide.createIcons();
        }, 2000);
      }).catch(err => {
        console.error('Gagal menyalin: ', err);
      });
    });
  });
});
