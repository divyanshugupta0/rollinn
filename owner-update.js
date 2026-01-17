// Registration steps functionality
let currentStep = 1;
const totalSteps = 3;

// Initialize registration steps
function initRegistrationSteps() {
    showRegistrationStep(1);
    updateProgressBar(1);
}

// Show specific registration step
function showRegistrationStep(step) {
    // Hide all steps
    for (let i = 1; i <= totalSteps; i++) {
        const stepElement = document.getElementById(`registrationStep${i}`);
        if (stepElement) {
            stepElement.style.display = 'none';
        }
    }
    
    // Show current step
    const currentStepElement = document.getElementById(`registrationStep${step}`);
    if (currentStepElement) {
        currentStepElement.style.display = 'block';
        currentStep = step;
        
        // Update progress bar
        updateProgressBar(step);
    }
}

// Update progress bar
function updateProgressBar(step) {
    const progressBar = document.getElementById('registrationProgress');
    if (progressBar) {
        const progressPercentage = (step / totalSteps) * 100;
        progressBar.style.width = `${progressPercentage}%`;
        progressBar.setAttribute('aria-valuenow', progressPercentage);
        
        // Update step indicator
        const stepIndicator = document.getElementById('currentStepIndicator');
        if (stepIndicator) {
            stepIndicator.textContent = step;
        }
    }
}

// Next step
function nextRegistrationStep() {
    if (currentStep < totalSteps) {
        showRegistrationStep(currentStep + 1);
    }
}

// Previous step
function prevRegistrationStep() {
    if (currentStep > 1) {
        showRegistrationStep(currentStep - 1);
    }
}

// Reset registration form
function resetRegistrationForm() {
    const form = document.getElementById('schoolRegistrationForm');
    if (form) {
        form.reset();
        showRegistrationStep(1);
    }
}

// Preview registration
function previewRegistration() {
    // Get form data
    const schoolName = document.getElementById('schoolName').value;
    const schoolCode = document.getElementById('schoolCode').value;
    const schoolType = document.getElementById('schoolType').value;
    const principalName = document.getElementById('principalName').value;
    const principalEmail = document.getElementById('principalEmail').value;
    const schoolPhone = document.getElementById('schoolPhone').value;
    const city = document.getElementById('city').value;
    const state = document.getElementById('state').value;
    
    // Get admin credentials
    const adminUsername = document.getElementById('adminUsername').value;
    const adminEmail = document.getElementById('adminEmail').value;
    
    // Get subscription plan
    const sparkPlan = document.getElementById('sparkPlan');
    const selectedPlan = sparkPlan && sparkPlan.checked ? 'Spark (1 Month)' : 'Bullet (2 Months)';
    
    // Create preview HTML
    const previewHTML = `
        <div class="card">
            <div class="card-header">
                <h5>Registration Preview</h5>
            </div>
            <div class="card-body">
                <h6>School Information</h6>
                <p><strong>Name:</strong> ${schoolName || 'Not provided'}</p>
                <p><strong>Code:</strong> ${schoolCode || 'Not provided'}</p>
                <p><strong>Type:</strong> ${schoolType || 'Not provided'}</p>
                <p><strong>Location:</strong> ${city}, ${state}</p>
                
                <hr>
                <h6>Contact Information</h6>
                <p><strong>Principal:</strong> ${principalName || 'Not provided'}</p>
                <p><strong>Email:</strong> ${principalEmail || 'Not provided'}</p>
                <p><strong>Phone:</strong> ${schoolPhone || 'Not provided'}</p>
                
                <hr>
                <h6>Admin Account</h6>
                <p><strong>Username:</strong> ${adminUsername || 'Not provided'}</p>
                <p><strong>Email:</strong> ${adminEmail || 'Not provided'}</p>
                
                <hr>
                <h6>Subscription</h6>
                <p><strong>Plan:</strong> ${selectedPlan}</p>
            </div>
        </div>
    `;
    
    // Create and show modal
    const modalHTML = `
        <div class="modal fade" id="previewModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Registration Preview</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${previewHTML}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing preview modal if any
    const existingModal = document.getElementById('previewModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create and show new modal
    const modalElement = document.createElement('div');
    modalElement.innerHTML = modalHTML;
    document.body.appendChild(modalElement);
    const modal = new bootstrap.Modal(document.getElementById('previewModal'));
    modal.show();
}

// Complete registration
function completeRegistration() {
    if (!isFirebaseConnected) {
        showAlert('Please connect to Firebase first', 'danger');
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
    const selectedPlan = sparkPlan && sparkPlan.checked ? 'spark' : 'bullet';
    
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

// Redirect to registration section
function goToRegistration() {
    switchSection('registration');
    initRegistrationSteps();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize registration steps
    initRegistrationSteps();
    
    // Add click handler to "Add School" button in schools section
    const addSchoolButtons = document.querySelectorAll('.btn.btn-success');
    addSchoolButtons.forEach(button => {
        if (button.textContent.includes('Add New School')) {
            // Replace the onclick handler
            button.onclick = function(e) {
                e.preventDefault();
                goToRegistration();
                return false;
            };
        }
    });
});