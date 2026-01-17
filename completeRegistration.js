// Function to complete the registration process
function completeRegistration() {
    // Check if Firebase is connected
    if (!isFirebaseConnected) {
        showAlert('Please connect to Firebase first', 'danger');
        return;
    }
    
    // Get admin credentials from the form
    const adminUsername = document.getElementById('modalAdminUsername').value;
    const adminPassword = document.getElementById('modalAdminPassword').value;
    const adminEmail = document.getElementById('modalAdminEmail').value;
    
    // Get subscription plan
    const subscriptionPlan = document.querySelector('input[name="subscriptionPlan"]:checked').value;
    const subscriptionDuration = subscriptionPlan === 'spark' ? 1 : 2; // months
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + subscriptionDuration);
    
    // Get school information
    const schoolName = document.getElementById('modalSchoolName').value;
    const schoolType = document.getElementById('modalSchoolType').value;
    const schoolLocation = document.getElementById('modalSchoolLocation').value;
    const schoolContact = document.getElementById('modalSchoolContact').value;
    
    // Validate required fields
    if (!schoolName || !schoolType || !schoolLocation || !schoolContact || 
        !adminUsername || !adminPassword || !adminEmail) {
        showAlert('Please fill in all required fields', 'danger');
        return;
    }
    
    // Create school data object
    const schoolData = {
        name: schoolName,
        type: schoolType,
        location: schoolLocation,
        contact: schoolContact,
        contacts: {
            admin: {
                name: adminUsername,
                email: adminEmail,
                username: adminUsername
            },
            phone: schoolContact
        },
        subscription: {
            plan: subscriptionPlan,
            startDate: new Date().toISOString(),
            endDate: subscriptionEndDate.toISOString(),
            status: 'active'
        },
        status: 'Active',
        registrationDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        ownerId: currentUser ? currentUser.uid : null
    };
    
    // Save to Firebase schools database
    const newSchoolRef = database.ref('schools').push();
    const schoolId = newSchoolRef.key;
    
    // Save admin credentials to school's Firebase (not for authentication)
    database.ref(`schools/${schoolId}/adminCredentials`).set({
        username: adminUsername,
        password: adminPassword, // In a real app, this should be hashed
        email: adminEmail
    });
    
    // Save school data without admin credentials
    database.ref(`schools/${schoolId}`).set(schoolData)
        .then(() => {
            // Save admin info (without password) and school data to owner's database
            const ownerSchoolData = {
                ...schoolData,
                schoolId: schoolId,
                adminInfo: {
                    username: adminUsername,
                    email: adminEmail
                }
            };
            
            // Save in owner's database if user is logged in
            if (currentUser) {
                ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + schoolId).set(ownerSchoolData);
            }
            
            showAlert('School registered successfully!', 'success');
            
            // Close the modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('subscriptionPlanModal'));
            if (modal) {
                modal.hide();
            }
            
            // Add to recent activities
            addRecentActivity(`New school registered: ${schoolData.name}`);
            
            // Update UI
            loadSchoolsFromFirebase();
        })
        .catch((error) => {
            console.error('Error registering school:', error);
            showAlert('Error registering school: ' + error.message, 'danger');
        });
}

// Function to go back to admin credentials modal
function backToAdminCredentials() {
    // Hide subscription modal
    const subscriptionModal = bootstrap.Modal.getInstance(document.getElementById('subscriptionPlanModal'));
    if (subscriptionModal) {
        subscriptionModal.hide();
    }
    
    // Show admin credentials modal
    const adminModal = new bootstrap.Modal(document.getElementById('adminCredentialsModal'));
    adminModal.show();
}

// Function to show subscription modal
function showSubscriptionModal() {
    // Validate admin credentials
    const adminUsername = document.getElementById('adminUsername').value;
    const adminPassword = document.getElementById('adminPassword').value;
    const adminEmail = document.getElementById('adminEmail').value;
    
    if (!adminUsername || !adminPassword || !adminEmail) {
        showAlert('Please fill in all admin credential fields', 'danger');
        return;
    }
    
    // Hide admin credentials modal
    const adminModal = bootstrap.Modal.getInstance(document.getElementById('adminCredentialsModal'));
    if (adminModal) {
        adminModal.hide();
    }
    
    // Show subscription modal
    const subscriptionModal = new bootstrap.Modal(document.getElementById('subscriptionPlanModal'));
    subscriptionModal.show();
}