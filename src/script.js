document.addEventListener('DOMContentLoaded', () => {
    setupNavbarScroll();
    setupMobileMenu();
    startLiveClock();
    handleContactForm();
});

function setupMobileMenu() {
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileBtn && navLinks) {
        mobileBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');

            // Toggle icon
            const icon = mobileBtn.querySelector('i');
            if (icon) {
                if (navLinks.classList.contains('active')) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-times');
                } else {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        });

        // Close menu when clicking a link
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                const icon = mobileBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            });
        });
    }
}

function handleContactForm() {
    const form = document.querySelector('.contact-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const status = document.createElement('div');
        status.className = 'form-success-message';

        const data = new FormData(e.target);

        try {
            const response = await fetch(e.target.action, {
                method: form.method,
                body: data,
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                status.textContent = "Thanks for your submission!";
                form.reset();
            } else {
                status.textContent = "Oops! There was a problem submitting your form";
                status.style.color = "#ff5f56";
                status.style.borderColor = "#ff5f56";
                status.style.background = "rgba(255, 95, 86, 0.2)";
            }
        } catch (error) {
            status.textContent = "Oops! There was a problem submitting your form";
            status.style.color = "#ff5f56";
            status.style.borderColor = "#ff5f56";
            status.style.background = "rgba(255, 95, 86, 0.2)";
        }

        // Remove existing status if any
        const existingStatus = form.querySelector('.form-success-message');
        if (existingStatus) existingStatus.remove();

        form.appendChild(status);
        status.style.display = 'block';

        // Remove message after 5 seconds
        setTimeout(() => {
            status.remove();
        }, 5000);
    });
}

function setupNavbarScroll() {
    const navbar = document.getElementById('navbar');

    if (!navbar) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

function startLiveClock() {
    const clockElement = document.getElementById('la-time');

    if (!clockElement) return;

    function updateClock() {
        const now = new Date();
        const options = {
            timeZone: 'America/Los_Angeles',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        const timeString = now.toLocaleTimeString('en-US', options);
        clockElement.textContent = `${timeString} PST`;
    }

    // Update immediately and then every second
    updateClock();
    setInterval(updateClock, 1000);
}


