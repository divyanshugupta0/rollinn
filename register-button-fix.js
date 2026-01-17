// Function to complete the registration process
function completeRegistration() {
    // Check if Firebase is connected
    if (!isFirebaseConnected) {
        showAlert('Please connect to Firebase first', 'danger');
        return;
    }
    
    // Validate form fields
    if (!validateRegistrationForm()) {
        return;
    }
    
    // Get school data
    const schoolData = {
        name: document.getElementById('schoolName').value,
        code: document.getElementById('schoolCode').value,
        type: document.getElementById('schoolType').value,
        establishedYear: document.getElementById('establishedYear').value,
        address: {
            complete: document.getElementById('schoolAddress').value,
            city: document.getElementById('city').value,
            state: document.getElementById('state').value,
            zipCode: document.getElementById('zipCode').value
        },
        contacts: {
            principal: {
                name: document.getElementById('principalName').value,
                email: document.getElementById('principalEmail').value
            },
            admin: {
                name: document.getElementById('adminName').value,
                email: document.getElementById('adminEmail').value
            },
            phone: document.getElementById('schoolPhone').value,
            alternatePhone: document.getElementById('alternatePhone').value
        },
        details: {
            capacity: parseInt(document.getElementById('studentCapacity').value),
            currentStudents: parseInt(document.getElementById('currentStudents').value) || 0,
            teacherCount: parseInt(document.getElementById('teacherCount').value) || 0,
            accreditation: document.getElementById('accreditation').value,
            website: document.getElementById('website').value
        },
        facilities: {
            library: document.getElementById('hasLibrary').checked,
            computerLab: document.getElementById('hasLab').checked,
            sports: document.getElementById('hasSports').checked,
            transportation: document.getElementById('hasTransport').checked
        }
    };
    
    // Get admin credentials
    const adminData = {
        username: document.getElementById('adminUsername').value,
        password: document.getElementById('adminPassword').value,
        email: document.getElementById('adminEmail').value
    };
    
    // Get selected subscription plan
    const sparkPlan = document.getElementById('sparkPlan');
    const selectedPlan = sparkPlan.checked ? 'spark' : 'bullet';
    
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
    
    // Save school data to school's Firebase
    newSchoolRef.set(completeSchoolData)
        .then(() => {
            // Save admin credentials in a separate secure location in school's Firebase
            return database.ref('schoolAdmins/' + schoolId).set({
                username: adminData.username,
                email: adminData.email,
                password: adminData.password, // In a real app, this should be hashed
                schoolId: schoolId,
                createdAt: new Date().toISOString()
            });
        })
        .then(() => {
            // Save school data and subscription info to owner's Firebase
            if (currentUser) {
                return ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + schoolId).set({
                    ...completeSchoolData,
                    schoolId: schoolId,
                    subscription: {
                        plan: selectedPlan,
                        startDate: startDate.toISOString(),
                        endDate: endDate.toISOString(),
                        status: 'active'
                    }
                });
            }
            return Promise.resolve();
        })
        .then(() => {
            // Show success message
            showAlert('School registered successfully with admin account and ' + 
                (selectedPlan === 'spark' ? '1 month' : '2 month') + ' subscription plan!', 'success');
            
            // Add to recent activities
            addRecentActivity(`New school registered: ${schoolData.name} with ${selectedPlan} plan`);
            
            // Reset form and go back to step 1
            resetRegistrationForm();
            
            // Update dashboard stats if function exists
            if (typeof updateDashboardStats === 'function') {
                updateDashboardStats();
            }
        })
        .catch((error) => {
            console.error('Error registering school:', error);
            showAlert('Error registering school: ' + error.message, 'danger');
        });
}

// Validate registration form
function validateRegistrationForm() {
    // Required fields from Step 1
    const schoolName = document.getElementById('schoolName').value;
    const schoolCode = document.getElementById('schoolCode').value;
    const schoolType = document.getElementById('schoolType').value;
    const schoolAddress = document.getElementById('schoolAddress').value;
    const city = document.getElementById('city').value;
    const state = document.getElementById('state').value;
    const zipCode = document.getElementById('zipCode').value;
    
    // Required fields from Step 2
    const principalName = document.getElementById('principalName').value;
    const principalEmail = document.getElementById('principalEmail').value;
    const schoolPhone = document.getElementById('schoolPhone').value;
    const adminUsername = document.getElementById('adminUsername').value;
    const adminPassword = document.getElementById('adminPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Required fields from Step 3
    const studentCapacity = document.getElementById('studentCapacity').value;
    
    // Validate required fields
    if (!schoolName || !schoolCode || !schoolType || !schoolAddress || !city || !state || !zipCode) {
        showAlert('Please fill in all required school information fields', 'danger');
        showRegistrationStep(1);
        return false;
    }
    
    if (!principalName || !principalEmail || !schoolPhone || !adminUsername || !adminPassword) {
        showAlert('Please fill in all required contact information fields', 'danger');
        showRegistrationStep(2);
        return false;
    }
    
    // Validate password match
    if (adminPassword !== confirmPassword) {
        showAlert('Admin passwords do not match', 'danger');
        showRegistrationStep(2);
        return false;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(principalEmail)) {
        showAlert('Please enter a valid principal email address', 'danger');
        showRegistrationStep(2);
        return false;
    }
    
    // Validate admin email if provided
    const adminEmail = document.getElementById('adminEmail').value;
    if (adminEmail && !emailRegex.test(adminEmail)) {
        showAlert('Please enter a valid admin email address', 'danger');
        showRegistrationStep(2);
        return false;
    }
    
    if (!studentCapacity) {
        showAlert('Please enter student capacity', 'danger');
        showRegistrationStep(3);
        return false;
    }
    
    return true;
}