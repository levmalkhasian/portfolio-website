document.addEventListener('DOMContentLoaded', () => {
    setupNavbarScroll();
    startLiveClock();
    runTypewriterAnimation();
    handleContactForm();
});

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

function runTypewriterAnimation() {
    const codeElement = document.getElementById('typewriter');

    if (!codeElement) return;

    // The text to type out character by character
    const plainText = `class Levon:
    def __init__(self):
        self.name = "Levon Malkhasian"
        self.role = "Software Engineer"
        self.location = "Los Angeles, CA"

    def sleep(self):
        return None

    def learning(self):
        return "Always."`;

    // The final HTML with syntax highlighting to swap in
    const finalHtml = [
        `<span class="keyword">class</span> <span class="function">Levon</span>:`,
        `    <span class="keyword">def</span> <span class="function">__init__</span>(<span class="variable">self</span>):`,
        `        <span class="variable">self</span>.name = <span class="string">"Levon Malkhasian"</span>`,
        `        <span class="variable">self</span>.role = <span class="string">"Software Engineer"</span>`,
        `        <span class="variable">self</span>.location = <span class="string">"Los Angeles, CA"</span>`,
        ``,
        `    <span class="keyword">def</span> <span class="function">sleep</span>(<span class="variable">self</span>):`,
        `        <span class="keyword">return</span> <span class="keyword">None</span>`,
        ``,
        `    <span class="keyword">def</span> <span class="function">learning</span>(<span class="variable">self</span>):`,
        `        <span class="keyword">return</span> <span class="string">"Always."</span>`
    ].join('\n');

    let charIndex = 0;
    const typingSpeed = 15; // ms
    const initialDelay = 1000; // ms

    function typeChar() {
        if (charIndex < plainText.length) {
            codeElement.textContent += plainText.charAt(charIndex);
            charIndex++;
            setTimeout(typeChar, typingSpeed);
        } else {
            // Apply full syntax highlighting once typing is complete
            codeElement.innerHTML = finalHtml;
        }
    }

    setTimeout(typeChar, initialDelay);
}
