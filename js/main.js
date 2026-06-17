document.addEventListener('DOMContentLoaded', () => {
  // 1. STICKY NAVBAR & ACTIVE NAVIGATION LINKS
  const navbar = document.getElementById('navbar');
  const navLinks = document.querySelectorAll('.nav-links a');
  const path = window.location.pathname;
  const pageName = path.split("/").pop();

  navLinks.forEach(link => {
    link.classList.remove('active');
    const href = link.getAttribute('href');
    
    if (href === pageName || 
        (pageName === '' && href === 'index.html') ||
        (pageName === 'index.html' && href === 'index.html') ||
        ((pageName === 'beam-design.html' || pageName === 'column-design.html' || pageName === 'slab-design.html') && href === 'calculators.html')) {
      link.classList.add('active');
    }
  });

  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // Smooth scroll logic for local anchors only
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href.startsWith('#')) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (href === '#') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        const targetSection = document.querySelector(href);
        if (targetSection) {
          // Toggle mobile menu off if open
          document.getElementById('nav-links').classList.remove('active');
          document.getElementById('hamburger').classList.remove('active');

          window.scrollTo({
            top: targetSection.offsetTop - 80,
            behavior: 'smooth'
          });
        }
      });
    }
  });

  // 2. MOBILE HAMBURGER MENU
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('nav-links');

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('active');
  });

  // Close mobile menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
    }
  });

  // Close mobile menu when a link is clicked
  const menuLinks = mobileMenu.querySelectorAll('a');
  menuLinks.forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
    });
  });

  // 3. STATS COUNT-UP ANIMATION
  const statsSection = document.querySelector('.about-stats');
  const statNums = document.querySelectorAll('.stat-num');
  let started = false;

  const startCount = () => {
    statNums.forEach(num => {
      const target = parseInt(num.getAttribute('data-target'), 10);
      const duration = 2000; // 2 seconds
      const stepTime = Math.abs(Math.floor(duration / target));
      let currentVal = 0;

      const timer = setInterval(() => {
        currentVal += 1;
        if (num.getAttribute('data-target') === '15' || num.getAttribute('data-target') === '12') {
          num.textContent = currentVal + '+';
        } else {
          num.textContent = currentVal;
        }

        if (currentVal >= target) {
          clearInterval(timer);
          if (num.getAttribute('data-target') === '15' || num.getAttribute('data-target') === '12') {
            num.textContent = target + '+';
          } else {
            num.textContent = target;
          }
        }
      }, Math.max(stepTime, 15));
    });
  };

  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !started) {
        startCount();
        started = true;
      }
    });
  }, { threshold: 0.5 });

  if (statsSection) {
    statsObserver.observe(statsSection);
  }

  // 4. PORTFOLIO FILTERING
  const filterBtns = document.querySelectorAll('.filter-btn');
  const projectCards = document.querySelectorAll('.project-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Set active button
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filterValue = btn.getAttribute('data-filter');

      projectCards.forEach(card => {
        // Fade out
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9) translateY(10px)';
        card.style.pointerEvents = 'none';

        setTimeout(() => {
          if (filterValue === 'all' || card.getAttribute('data-category') === filterValue) {
            card.style.display = 'block';
            setTimeout(() => {
              card.style.opacity = '1';
              card.style.transform = 'scale(1) translateY(0)';
              card.style.pointerEvents = 'auto';
            }, 50);
          } else {
            card.style.display = 'none';
          }
        }, 300);
      });
    });
  });

  // 5. TESTIMONIALS CAROUSEL
  const track = document.getElementById('testimonials-track');
  if (track) {
    const slides = Array.from(track.children);
    const dotsContainer = document.getElementById('carousel-dots');
    let activeIndex = 0;
    let carouselTimer;

    if (dotsContainer) {
      // Create dot buttons
      slides.forEach((_, index) => {
        const dot = document.createElement('button');
        dot.classList.add('carousel-dot');
        if (index === 0) dot.classList.add('active');
        dot.setAttribute('aria-label', `Go to testimonial slide ${index + 1}`);
        dotsContainer.appendChild(dot);

        dot.addEventListener('click', () => {
          goToSlide(index);
          resetAutoplay();
        });
      });
    }

    const dots = dotsContainer ? Array.from(dotsContainer.children) : [];

    const goToSlide = (index) => {
      activeIndex = index;
      track.style.transform = `translateX(-${index * 100}%)`;
      
      dots.forEach(d => d.classList.remove('active'));
      if (dots[index]) dots[index].classList.add('active');
    };

    const startAutoplay = () => {
      carouselTimer = setInterval(() => {
        let nextIndex = activeIndex + 1;
        if (nextIndex >= slides.length) {
          nextIndex = 0;
        }
        goToSlide(nextIndex);
      }, 6000); // Change slide every 6 seconds
    };

    const resetAutoplay = () => {
      clearInterval(carouselTimer);
      startAutoplay();
    };

    if (slides.length > 0) {
      startAutoplay();
    }
  }

  // 6. SCROLL FADE-UP INTERSECTION OBSERVER
  const fadeUpElements = document.querySelectorAll('.fade-up-init');

  const fadeUpObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-up-in');
        // Unobserve once animation is loaded
        fadeUpObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px' // triggers slightly before entering the screen
  });

  fadeUpElements.forEach(el => fadeUpObserver.observe(el));

  // 7. CONTACT FORM VALIDATION & FEEDBACK
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.removeAttribute('onsubmit');
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Clear existing error messages
      const existingErrors = contactForm.querySelectorAll('.inline-error-msg');
      existingErrors.forEach(el => el.remove());
      
      const nameInput = document.getElementById('c-name');
      const emailInput = document.getElementById('c-email');
      const phoneInput = document.getElementById('c-phone');
      const locationInput = document.getElementById('c-location');
      const msgInput = document.getElementById('c-msg');
      const typeSelect = document.getElementById('c-type');
      
      let isValid = true;
      
      const showError = (inputEl, message) => {
        const errorSpan = document.createElement('span');
        errorSpan.className = 'inline-error-msg';
        errorSpan.style.color = '#F5222D';
        errorSpan.style.fontSize = '0.75rem';
        errorSpan.style.display = 'block';
        errorSpan.style.marginTop = '0.25rem';
        errorSpan.style.fontFamily = 'var(--font-mono)';
        errorSpan.style.textAlign = 'left';
        errorSpan.textContent = message;
        inputEl.parentNode.appendChild(errorSpan);
        isValid = false;
      };
      
      if (!nameInput.value.trim()) {
        showError(nameInput, 'Full Name is required.');
      }
      
      const emailValue = emailInput.value.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailValue) {
        showError(emailInput, 'Business Email is required.');
      } else if (!emailRegex.test(emailValue)) {
        showError(emailInput, 'Please enter a valid email address.');
      }
      
      if (phoneInput && phoneInput.value.trim()) {
        const phoneDigits = phoneInput.value.replace(/\D/g, '').length;
        if (phoneDigits < 7 || phoneDigits > 15) {
          showError(phoneInput, 'Please enter a valid phone number (7 to 15 digits).');
        }
      }
      
      if (locationInput && !locationInput.value.trim()) {
        showError(locationInput, 'Location is required.');
      }
      
      if (!msgInput.value.trim()) {
        showError(msgInput, 'Message is required.');
      }
      
      if (isValid) {
        // Log submission locally to leads database
        const leads = JSON.parse(localStorage.getItem('tools_leads') || '[]');
        const scopeLabel = typeSelect ? typeSelect.options[typeSelect.selectedIndex].text : 'General Inquiry';
        const locationText = locationInput ? locationInput.value.trim() : 'N/A';
        
        leads.push({
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          phone: phoneInput ? phoneInput.value.trim() : 'N/A',
          timestamp: new Date().toLocaleString(),
          calcType: `Contact [${locationText}]: ` + scopeLabel,
          location: locationText,
          geometry: locationText, // mapping to geometry to show on dashboard if needed
          reinforcement: 'N/A',
          status: 'N/A',
          concreteVol: 'N/A',
          steelWeight: 'N/A'
        });
        localStorage.setItem('tools_leads', JSON.stringify(leads));
        
        // Success feedback
        const parent = contactForm.parentNode;
        parent.innerHTML = `
          <div style="text-align: center; padding: 3rem 1.5rem; color: #fff; background: rgba(79, 134, 198, 0.05); border: 1px solid var(--color-gold); border-radius: 8px;" class="fade-up-init fade-up-in">
            <div style="font-size: 3rem; color: var(--color-gold); margin-bottom: 1.5rem;"><i class="fa-solid fa-circle-check"></i></div>
            <h3 style="font-family: var(--font-serif); font-size: 1.8rem; margin-bottom: 1rem; color: var(--color-gold);">Proposal Received</h3>
            <p style="color: var(--text-secondary); max-width: 450px; margin: 0 auto; line-height: 1.6; font-size: 0.95rem;">
              Your proposal has been received. We'll be in touch within 24 hours.
            </p>
          </div>
        `;
      }
    });
  }
});
