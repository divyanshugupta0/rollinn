// School Registration with Admin Credentials and Subscription Plan

// Function to handle adding a new school
function addSchool() {
    // Get school data from the form
    const schoolData = {
        name: document.getElementById('modalSchoolName').value,
        type: document.getElementById('modalSchoolType').value,
        location: document.getElementById('modalSchoolLocation').value,
        contact: document.getElementById('modalSchoolContact').value
    };
    
    // Store school data in session storage for later use
    sessionStorage.setItem('pendingSchoolData', JSON.stringify(schoolData));
    
    // Hide the current modal
    const addSchoolModal = bootstrap.Modal.getInstance(document.getElementById('addSchoolModal'));
    addSchoolModal.hide();
    
    // Show the admin credentials modal
    setTimeout(() => {
        const adminCredentialsModal = new bootstrap.Modal(document.getElementById('adminCredentialsModal'));
        adminCredentialsModal.show();
    }, 500);
}

// Function to show subscription plan modal after admin credentials
function showSubscriptionModal() {
    // Get admin credentials
    const adminData = {
        username: document.getElementById('adminUsername').value,
        password: document.getElementById('adminPassword').value,
        email: document.getElementById('adminEmail').value
    };
    
    // Validate admin credentials
    if (!adminData.username || !adminData.password || !adminData.email) {
        showAlert('Please fill in all admin credential fields', 'danger');
        return;
    }
    
    // Store admin data in session storage
    sessionStorage.setItem('pendingAdminData', JSON.stringify(adminData));
    
    // Hide admin credentials modal
    const adminCredentialsModal = bootstrap.Modal.getInstance(document.getElementById('adminCredentialsModal'));
    adminCredentialsModal.hide();
    
    // Show subscription plan modal
    setTimeout(() => {
        const subscriptionPlanModal = new bootstrap.Modal(document.getElementById('subscriptionPlanModal'));
        subscriptionPlanModal.show();
    }, 500);
}

// Function to go back to admin credentials from subscription plan
function backToAdminCredentials() {
    // Hide subscription plan modal
    const subscriptionPlanModal = bootstrap.Modal.getInstance(document.getElementById('subscriptionPlanModal'));
    subscriptionPlanModal.hide();
    
    // Show admin credentials modal
    setTimeout(() => {
        const adminCredentialsModal = new bootstrap.Modal(document.getElementById('adminCredentialsModal'));
        adminCredentialsModal.show();
    }, 500);
}

// Function to complete the registration process
function completeRegistration() {
    if (!isFirebaseConnected) {
        showAlert('Please connect to Firebase first', 'danger');
        return;
    }
    
    // Get data from session storage
    const schoolData = JSON.parse(sessionStorage.getItem('pendingSchoolData'));
    const adminData = JSON.parse(sessionStorage.getItem('pendingAdminData'));
    
    // Get selected subscription plan
    const selectedPlan = document.querySelector('input[name="subscriptionPlan"]:checked').value;
    
    // Calculate plan duration
    const startDate = new Date();
    const endDate = new Date();
    if (selectedPlan === 'spark') {
        endDate.setMonth(endDate.getMonth() + 1); // 1 month for Spark plan
    } else {
        endDate.setMonth(endDate.getMonth() + 2); // 2 months for Bullet plan
    }
    
    // Create complete school data object
    const completeSchoolData = {
        ...schoolData,
        admin: {
            username: adminData.username,
            email: adminData.email
            // Note: We don't store the password in plain text in the school record
        },
        subscription: {
            plan: selectedPlan,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            status: 'active'
        },
        status: 'Active',
        registrationDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        ownerId: currentUser ? currentUser.uid : null
    };
    
    // Save school data to Firebase
    const newSchoolRef = database.ref('schools').push();
    const schoolId = newSchoolRef.key;
    
    // Save school data
    newSchoolRef.set(completeSchoolData)
        .then(() => {
            // Also save admin credentials in a separate secure location
            // In a real app, this would be handled differently for security
            database.ref('schoolAdmins/' + schoolId).set({
                username: adminData.username,
                email: adminData.email,
                schoolId: schoolId,
                createdAt: new Date().toISOString()
            });
            
            // Also save in owner's database
            if (currentUser) {
                ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + schoolId).set({
                    ...completeSchoolData,
                    schoolId: schoolId
                });
            }
            
            // Clear session storage
            sessionStorage.removeItem('pendingSchoolData');
            sessionStorage.removeItem('pendingAdminData');
            
            // Hide subscription plan modal
            const subscriptionPlanModal = bootstrap.Modal.getInstance(document.getElementById('subscriptionPlanModal'));
            subscriptionPlanModal.hide();
            
            // Show success message
            showAlert('School registered successfully with admin account and ' + 
                (selectedPlan === 'spark' ? '1 month' : '2 month') + ' subscription plan!', 'success');
            
            // Add to recent activities
            addRecentActivity(`New school registered: ${schoolData.name} with ${selectedPlan} plan`);
            
            // Update dashboard stats
            if (typeof updateDashboardStats === 'function') {
                updateDashboardStats();
            }
        })
        .catch((error) => {
            console.error('Error registering school:', error);
            showAlert('Error registering school: ' + error.message, 'danger');
        });
}