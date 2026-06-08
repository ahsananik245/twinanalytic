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
        (pageName === 'index.html' && href === 'index.html')) {
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
  const slides = Array.from(track.children);
  const dotsContainer = document.getElementById('carousel-dots');
  let activeIndex = 0;
  let carouselTimer;

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

  const dots = Array.from(dotsContainer.children);

  const goToSlide = (index) => {
    activeIndex = index;
    track.style.transform = `translateX(-${index * 100}%)`;
    
    dots.forEach(d => d.classList.remove('active'));
    dots[index].classList.add('active');
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

  if (track && slides.length > 0) {
    startAutoplay();
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
});
