// Store admin password for later retrieval
function completeRegistration() {
    // Get school data from form
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
                name: document.getElementById('adminName').value
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
            database.ref('schoolAdmins/' + schoolId).set({
                username: adminData.username,
                email: adminData.email,
                password: adminData.password, // Store password for admin access
                schoolId: schoolId,
                createdAt: new Date().toISOString()
            });
            
            // Also save in owner's database with proper error handling
            if (currentUser) {
                // Make sure to include the schoolId in the data saved to owner's database
                const ownerSchoolData = {
                    ...completeSchoolData,
                    schoolId: schoolId
                };
                
                ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + schoolId).set(ownerSchoolData)
                    .then(() => {
                        console.log("School saved in owner's database");
                    })
                    .catch(error => {
                        console.error("Error saving to owner's database:", error);
                        // Try again with a simplified object if the full object fails
                        const simplifiedData = {
                            name: schoolData.name,
                            code: schoolData.code,
                            type: schoolData.type,
                            schoolId: schoolId,
                            status: 'Active',
                            registrationDate: new Date().toISOString()
                        };
                        ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + schoolId).set(simplifiedData)
                            .then(() => console.log("Simplified school data saved in owner's database"))
                            .catch(err => console.error("Failed to save even simplified data:", err));
                    });
            }
            
            // Hide subscription plan modal if it exists
            const subscriptionPlanModal = bootstrap.Modal.getInstance(document.getElementById('subscriptionPlanModal'));
            if (subscriptionPlanModal) {
                subscriptionPlanModal.hide();
            }
            
            // Show success message
            showAlert('School registered successfully with admin account and ' + 
                (selectedPlan === 'spark' ? '1 month' : '2 month') + ' subscription plan!', 'success');
            
            // Add to recent activities
            addRecentActivity(`New school registered: ${schoolData.name} with ${selectedPlan} plan`);
            
            // Reset form and go back to step 1
            resetRegistrationForm();
            
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