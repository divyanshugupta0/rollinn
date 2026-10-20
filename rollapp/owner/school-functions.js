// School management functions

// Load schools table with data
function loadSchoolsTable() {
    const tableBody = document.getElementById('schoolsTableBody');
    if (!tableBody) return;
    
    // Clear existing content
    tableBody.innerHTML = '';
    
    // Handle empty state
    if (!schools || schools.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="6" class="text-center">No schools found</td>';
        tableBody.appendChild(emptyRow);
        return;
    }
    
    // Add schools to the table
    schools.forEach(school => {
        const row = document.createElement('tr');
        
        // Create location string
        const location = school.address ? 
            `${school.address.city || ''}, ${school.address.state || ''}` : 
            'Not specified';
        
        // Create contact string
        const contact = school.contacts ? 
            (school.contacts.phone || 'Not specified') : 
            'Not specified';
        
        // Create status indicator
        const statusClass = school.status === 'Active' ? 'status-online' : 
                           (school.status === 'Pending' ? 'status-pending' : 'status-offline');
        
        // Create students count
        const students = school.details && school.details.currentStudents ? 
            school.details.currentStudents : 
            'N/A';
        
        // Create row content
        row.innerHTML = `
            <td>${school.name || 'Unnamed School'}</td>
            <td>${location}</td>
            <td>${contact}</td>
            <td><span class="status-indicator ${statusClass}"></span>${school.status || 'Unknown'}</td>
            <td>${students}</td>
            <td>
                <button class="btn btn-sm btn-info edit-school-btn" data-id="${school.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger delete-school-btn" data-id="${school.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Add event listeners to edit and delete buttons
    document.querySelectorAll('.edit-school-btn').forEach(button => {
        button.addEventListener('click', function() {
            const schoolId = this.getAttribute('data-id');
            editSchool(schoolId);
        });
    });
    
    document.querySelectorAll('.delete-school-btn').forEach(button => {
        button.addEventListener('click', function() {
            const schoolId = this.getAttribute('data-id');
            deleteSchool(schoolId);
        });
    });
}

// Edit school function
function editSchool(id) {
    if (!isFirebaseConnected) {
        showAlert('Firebase not connected', 'danger');
        return;
    }
    
    // Find the school in the schools array
    const school = schools.find(s => s.id === id);
    if (!school) {
        showAlert('School not found', 'danger');
        return;
    }
    
    // Populate the modal with school data
    document.getElementById('modalSchoolName').value = school.name || '';
    document.getElementById('modalSchoolType').value = school.type || '';
    document.getElementById('modalSchoolLocation').value = 
        school.address ? `${school.address.city}, ${school.address.state}` : '';
    document.getElementById('modalSchoolContact').value = 
        school.contacts ? school.contacts.phone || '' : '';
    
    // Set admin credentials if available
    if (school.contacts && school.contacts.admin) {
        document.getElementById('modalAdminUsername').value = school.contacts.admin.username || '';
        document.getElementById('modalAdminEmail').value = school.contacts.admin.email || '';
    }
    
    // Set subscription plan if available
    if (school.subscription && school.subscription.plan) {
        const planRadio = document.querySelector(`input[name="subscriptionPlan"][value="${school.subscription.plan}"]`);
        if (planRadio) planRadio.checked = true;
    }
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('addSchoolModal'));
    modal.show();
    
    // Change the modal title and button text to indicate editing
    document.querySelector('#addSchoolModal .modal-title').textContent = 'Edit School';
    document.querySelector('#addSchoolModal .modal-footer .btn-success').textContent = 'Save Changes';
    
    // Store the school ID in a data attribute for the save function
    document.querySelector('#addSchoolModal .modal-footer .btn-success').setAttribute('data-edit-id', id);
    
    // Replace the onclick handler
    document.querySelector('#addSchoolModal .modal-footer .btn-success').onclick = function() {
        saveSchoolChanges(id);
    };
}

// Save school changes
function saveSchoolChanges(id) {
    if (!isFirebaseConnected || !id) {
        showAlert('Cannot save changes: Firebase not connected or invalid school ID', 'danger');
        return;
    }
    
    // Get updated values from the modal
    const updatedData = {
        name: document.getElementById('modalSchoolName').value,
        type: document.getElementById('modalSchoolType').value,
        address: {
            city: document.getElementById('modalSchoolLocation').value.split(',')[0].trim(),
            state: document.getElementById('modalSchoolLocation').value.split(',')[1]?.trim() || ''
        },
        contacts: {
            phone: document.getElementById('modalSchoolContact').value,
            admin: {
                username: document.getElementById('modalAdminUsername').value,
                email: document.getElementById('modalAdminEmail').value
            }
        },
        subscription: {
            plan: document.querySelector('input[name="subscriptionPlan"]:checked').value
        },
        lastUpdated: new Date().toISOString()
    };
    
    // Update in Firebase
    database.ref(`schools/${id}`).update(updatedData)
        .then(() => {
            showAlert('School updated successfully!', 'success');
            
            // Also update in owner's database if available
            if (currentUser) {
                ownerAuth.database().ref(`owners/${currentUser.uid}/schools/${id}`).update(updatedData)
                    .catch(error => {
                        console.error("Error updating school in owner's database:", error);
                    });
            }
            
            // Hide the modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('addSchoolModal'));
            modal.hide();
            
            // Add to recent activities
            addRecentActivity(`School updated: ${updatedData.name}`);
            
            // Refresh the schools table
            loadSchoolsFromFirebase();
        })
        .catch(error => {
            console.error('Error updating school:', error);
            showAlert('Error updating school: ' + error.message, 'danger');
        });
}

// Refresh schools list
function refreshSchoolsList() {
    if (!isFirebaseConnected) {
        showAlert('Firebase not connected', 'danger');
        return;
    }
    
    showAlert('Refreshing schools list...', 'info');
    
    // Re-fetch schools from Firebase
    loadSchoolsFromFirebase();
    
    // Add to recent activities
    addRecentActivity('Schools list refreshed');
}

// Go to registration section
function goToRegistration() {
    switchSection('registration');
}