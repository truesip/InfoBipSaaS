// Main application JavaScript file

// DOM Elements
const sidebar = document.getElementById('sidebar');
const loginForm = document.getElementById('login-form');
const campaignForm = document.getElementById('create-campaign-form');

// API Base URL
const API_BASE_URL = '/api';

// Authentication state
let isAuthenticated = false;
let currentUser = null;
let authToken = localStorage.getItem('authToken');

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is authenticated
    checkAuth();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup sidebar navigation
    setupSidebar();
});

// Check authentication status
function checkAuth() {
    if (authToken) {
        // Validate token with server
        fetch(`${API_BASE_URL}/auth/validate`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                // Token invalid, clear it
                localStorage.removeItem('authToken');
                showLoginForm();
                throw new Error('Invalid authentication token');
            }
        })
        .then(data => {
            isAuthenticated = true;
            currentUser = data.user;
            updateUI();
        })
        .catch(error => {
            console.error('Authentication error:', error);
            showLoginForm();
        });
    } else {
        // No token, show login form
        showLoginForm();
    }
}

// Setup event listeners
function setupEventListeners() {
    // Login form submission
    const loginFormElement = document.getElementById('login');
    if (loginFormElement) {
        loginFormElement.addEventListener('submit', handleLogin);
    }
    
    // Campaign form submission
    const campaignFormElement = document.getElementById('campaign-form');
    if (campaignFormElement) {
        campaignFormElement.addEventListener('submit', handleCampaignSubmit);
    }
    
    // Add event listeners for sidebar navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', handleNavigation);
    });
}

// Setup sidebar navigation
function setupSidebar() {
    // Toggle submenu visibility
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.nextElementSibling && link.nextElementSibling.classList.contains('submenu')) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const submenu = link.nextElementSibling;
                submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block';
            });
        }
    });
}

// Handle login form submission
function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Login failed');
        }
    })
    .then(data => {
        // Store token and user data
        localStorage.setItem('authToken', data.token);
        authToken = data.token;
        isAuthenticated = true;
        currentUser = data.user;
        
        // Update UI
        hideLoginForm();
        updateUI();
        
        // Show success message
        showAlert('Login successful', 'success');
    })
    .catch(error => {
        console.error('Login error:', error);
        showAlert('Login failed. Please check your credentials.', 'danger');
    });
}

// Handle campaign form submission
function handleCampaignSubmit(e) {
    e.preventDefault();
    
    if (!isAuthenticated) {
        showAlert('You must be logged in to create a campaign', 'warning');
        showLoginForm();
        return;
    }
    
    const campaignName = document.getElementById('campaign-name').value;
    const callerId = document.getElementById('caller-id').value;
    const contactFile = document.getElementById('contact-file').files[0];
    const messageScript = document.getElementById('message-script').value;
    const transferKey = document.getElementById('transfer-key').value;
    
    // Create form data for file upload
    const formData = new FormData();
    formData.append('name', campaignName);
    formData.append('callerId', callerId);
    formData.append('contactFile', contactFile);
    formData.append('messageScript', messageScript);
    formData.append('transferKey', transferKey);
    
    fetch(`${API_BASE_URL}/campaigns`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`
        },
        body: formData
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Campaign creation failed');
        }
    })
    .then(data => {
        // Show success message
        showAlert('Campaign created successfully', 'success');
        
        // Reset form
        document.getElementById('campaign-form').reset();
        
        // Hide campaign form
        hideCampaignForm();
        
        // Load campaigns view
        loadCampaigns();
    })
    .catch(error => {
        console.error('Campaign creation error:', error);
        showAlert('Campaign creation failed. Please try again.', 'danger');
    });
}

// Handle navigation
function handleNavigation(e) {
    const href = e.currentTarget.getAttribute('href');
    
    // Skip if it's a submenu toggle
    if (e.currentTarget.nextElementSibling && e.currentTarget.nextElementSibling.classList.contains('submenu')) {
        return;
    }
    
    e.preventDefault();
    
    // Handle different navigation targets
    switch (href) {
        case '#dashboard':
            loadDashboard();
            break;
        case '#create-campaign':
            showCampaignForm();
            break;
        case '#view-campaigns':
            loadCampaigns();
            break;
        case '#view-users':
            loadUsers();
            break;
        case '#add-callerid':
            showCallerIdForm();
            break;
        case '#view-callerids':
            loadCallerIds();
            break;
        case '#tts-audio':
            loadTTSAudio();
            break;
        case '#documents':
            loadDocuments();
            break;
        case '#add-words':
            showBlocklistForm();
            break;
        case '#view-blocklist':
            loadBlocklist();
            break;
        case '#payment-history':
            loadPaymentHistory();
            break;
        case '#add-credit':
            showAddCreditForm();
            break;
        case '#call-history':
            loadCallHistory();
            break;
        case '#api-keys':
            loadAPIKeys();
            break;
        case '#email-api':
            loadEmailAPI();
            break;
        case '#rates':
            loadRates();
            break;
        case '#user-privilege':
            loadUserPrivilege();
            break;
        case '#profile':
            loadProfile();
            break;
        case '#send-notifications':
            showSendNotificationForm();
            break;
        case '#recent-notifications':
            loadNotifications();
            break;
        default:
            // Default to dashboard
            loadDashboard();
            break;
    }
    
    // Set active link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    e.currentTarget.classList.add('active');
}

// Show login form
function showLoginForm() {
    if (loginForm) {
        loginForm.classList.remove('d-none');
    }
}

// Hide login form
function hideLoginForm() {
    if (loginForm) {
        loginForm.classList.add('d-none');
    }
}

// Show campaign form
function showCampaignForm() {
    if (!isAuthenticated) {
        showAlert('You must be logged in to create a campaign', 'warning');
        showLoginForm();
        return;
    }
    
    if (campaignForm) {
        campaignForm.classList.remove('d-none');
    }
    
    // Load caller IDs for dropdown
    loadCallerIdOptions();
}

// Hide campaign form
function hideCampaignForm() {
    if (campaignForm) {
        campaignForm.classList.add('d-none');
    }
}

// Load caller ID options for campaign form
function loadCallerIdOptions() {
    if (!isAuthenticated) {
        return;
    }
    
    const callerIdSelect = document.getElementById('caller-id');
    if (!callerIdSelect) {
        return;
    }
    
    // Clear existing options
    callerIdSelect.innerHTML = '<option value="">Select a verified caller ID</option>';
    
    // Fetch caller IDs
    fetch(`${API_BASE_URL}/callerids`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Failed to load caller IDs');
        }
    })
    .then(data => {
        // Add options for each verified caller ID
        data.callerIds.forEach(callerId => {
            if (callerId.isVerified) {
                const option = document.createElement('option');
                option.value = callerId._id;
                option.textContent = callerId.phoneNumber;
                callerIdSelect.appendChild(option);
            }
        });
    })
    .catch(error => {
        console.error('Error loading caller IDs:', error);
        showAlert('Failed to load caller IDs', 'danger');
    });
}

// Load dashboard
function loadDashboard() {
    if (!isAuthenticated) {
        showAlert('You must be logged in to view the dashboard', 'warning');
        showLoginForm();
        return;
    }
    
    // Hide other forms/views
    hideLoginForm();
    hideCampaignForm();
    
    // Fetch dashboard data
    const endpoint = currentUser.role === 'admin' ? 'admin' : 'user';
    fetch(`${API_BASE_URL}/dashboard/${endpoint}`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Failed to load dashboard data');
        }
    })
    .then(data => {
        // Update dashboard UI with data
        updateDashboardUI(data.stats);
    })
    .catch(error => {
        console.error('Error loading dashboard:', error);
        showAlert('Failed to load dashboard data', 'danger');
    });
}

// Update dashboard UI with data
function updateDashboardUI(stats) {
    // Update user insights
    if (stats.users) {
        document.querySelector('.card:nth-child(1) .badge:nth-child(1)').textContent = stats.users.total;
        document.querySelector('.card:nth-child(1) .badge:nth-child(2)').textContent = stats.users.active;
        document.querySelector('.card:nth-child(1) .badge:nth-child(3)').textContent = stats.users.new;
    }
    
    // Update campaign reports
    if (stats.campaigns) {
        document.querySelector('.card:nth-child(2) .badge:nth-child(1)').textContent = stats.campaigns.total;
        document.querySelector('.card:nth-child(2) .badge:nth-child(2)').textContent = stats.campaigns.active;
    }
    
    // Update call counts
    if (stats.calls) {
        document.querySelector('.card:nth-child(2) .badge:nth-child(3)').textContent = stats.calls.inProgress || 0;
    }
    
    // Update billing reports
    if (stats.rates) {
        document.querySelector('.card:nth-child(3) .badge:nth-child(1)').textContent = `$${stats.rates.provider}`;
        document.querySelector('.card:nth-child(3) .badge:nth-child(2)').textContent = `$${stats.rates.platform}`;
    }
    
    if (stats.billing) {
        document.querySelector('.card:nth-child(3) .badge:nth-child(3)').textContent = `$${stats.billing.todayProfit.toFixed(2)}`;
    }
    
    // Update call statistics
    if (stats.calls) {
        document.querySelector('.card:nth-child(4) .badge:nth-child(1)').textContent = stats.calls.answered || 0;
        document.querySelector('.card:nth-child(4) .badge:nth-child(2)').textContent = stats.calls.failed || 0;
        document.querySelector('.card:nth-child(4) .badge:nth-child(3)').textContent = stats.calls.inProgress || 0;
        document.querySelector('.card:nth-child(4) .badge:nth-child(4)').textContent = stats.calls.busy || 0;
        document.querySelector('.card:nth-child(4) .badge:nth-child(5)').textContent = stats.calls.noAnswer || 0;
        document.querySelector('.card:nth-child(4) .badge:nth-child(6)').textContent = stats.calls.transfer || 0;
        document.querySelector('.card:nth-child(4) .badge:nth-child(7)').textContent = stats.calls.completed || 0;
    }
}

// Update UI based on authentication state
function updateUI() {
    if (isAuthenticated) {
        // Show user-specific elements
        document.querySelectorAll('.authenticated-only').forEach(el => {
            el.classList.remove('d-none');
        });
        
        // Hide non-authenticated elements
        document.querySelectorAll('.unauthenticated-only').forEach(el => {
            el.classList.add('d-none');
        });
        
        // Show/hide admin-specific elements
        if (currentUser && currentUser.role === 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.classList.remove('d-none');
            });
        } else {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.classList.add('d-none');
            });
        }
        
        // Load dashboard
        loadDashboard();
    } else {
        // Hide authenticated elements
        document.querySelectorAll('.authenticated-only').forEach(el => {
            el.classList.add('d-none');
        });
        
        // Show non-authenticated elements
        document.querySelectorAll('.unauthenticated-only').forEach(el => {
            el.classList.remove('d-none');
        });
        
        // Hide admin-specific elements
        document.querySelectorAll('.admin-only').forEach(el => {
            el.classList.add('d-none');
        });
    }
}

// Show alert message
function showAlert(message, type = 'info') {
    // Create alert element
    const alertEl = document.createElement('div');
    alertEl.className = `alert alert-${type} alert-dismissible fade show`;
    alertEl.role = 'alert';
    alertEl.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Add to page
    const mainContent = document.querySelector('main');
    if (mainContent) {
        mainContent.insertBefore(alertEl, mainContent.firstChild);
    }
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alertEl.classList.remove('show');
        setTimeout(() => {
            alertEl.remove();
        }, 150);
    }, 5000);
}

// Placeholder functions for other views
function loadCampaigns() {
    // Implementation for loading campaigns view
    console.log('Loading campaigns view...');
}

function loadUsers() {
    // Implementation for loading users view
    console.log('Loading users view...');
}

function showCallerIdForm() {
    // Implementation for showing caller ID form
    console.log('Showing caller ID form...');
}

function loadCallerIds() {
    // Implementation for loading caller IDs view
    console.log('Loading caller IDs view...');
}

function loadTTSAudio() {
    // Implementation for loading TTS/Audio view
    console.log('Loading TTS/Audio view...');
}

function loadDocuments() {
    // Implementation for loading documents view
    console.log('Loading documents view...');
}

function showBlocklistForm() {
    // Implementation for showing blocklist form
    console.log('Showing blocklist form...');
}

function loadBlocklist() {
    // Implementation for loading blocklist view
    console.log('Loading blocklist view...');
}

function loadPaymentHistory() {
    // Implementation for loading payment history view
    console.log('Loading payment history view...');
}

function showAddCreditForm() {
    // Implementation for showing add credit form
    console.log('Showing add credit form...');
}

function loadCallHistory() {
    // Implementation for loading call history view
    console.log('Loading call history view...');
}

function loadAPIKeys() {
    // Implementation for loading API keys view
    console.log('Loading API keys view...');
}

function loadEmailAPI() {
    // Implementation for loading email API view
    console.log('Loading email API view...');
}

function loadRates() {
    // Implementation for loading rates view
    console.log('Loading rates view...');
}

function loadUserPrivilege() {
    // Implementation for loading user privilege view
    console.log('Loading user privilege view...');
}

function loadProfile() {
    // Implementation for loading profile view
    console.log('Loading profile view...');
}

function showSendNotificationForm() {
    // Implementation for showing send notification form
    console.log('Showing send notification form...');
}

function loadNotifications() {
    // Implementation for loading notifications view
    console.log('Loading notifications view...');
}
