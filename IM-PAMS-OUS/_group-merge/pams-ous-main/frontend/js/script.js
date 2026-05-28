// PUP OUS – Personnel Daily Accomplishment Report System
// Main Script

document.addEventListener('DOMContentLoaded', () => {
    console.log('PUP OUS System Initialized');

    // Handle Login Button
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Simple validation feedback
            const email = document.querySelector('input[type="email"]').value;
            const password = document.querySelector('input[type="password"]').value;

            if (!email || !password) {
                alert('Please fill in both email and password.');
                return;
            }

            // In a real app, this would be an API call
            console.log('Login attempt with:', email);
            alert('Login feature is currently in development. You entered: ' + email);
        });
    }

    // Example of dynamic date (as seen in mockup)
    const headerDate = document.getElementById('header-date');
    if (headerDate) {
        headerDate.textContent = new Date().toLocaleDateString('en-PH', { 
            weekday: 'short', 
            month: 'long', 
            day: 'numeric', 
            year: 'numeric' 
        });
    }
});
