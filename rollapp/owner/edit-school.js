// Simple direct implementation for edit school functionality
function editSchool(id) {
    console.log("Edit school function called for ID:", id);
    
    if (!currentUser || !ownerAuth) {
        showAlert("You must be logged in to edit schools", "danger");
        return;
    }
    
    // Get school data
    ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + id).once('value')
        .then(snapshot => {
            if (!snapshot.exists()) {
                showAlert("School not found", "danger");
                return;
            }
            
            const school = snapshot.val();
            console.log("School data loaded:", school);
            
            // Create edit modal HTML
            const modalHTML = `
            <div class="modal fade" id="editSchoolModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Edit School</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">School Name</label>
                                    <input type="text" class="form-control" id="edit-name" value="${school.name || ''}">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">School Type</label>
                                    <select class="form-select" id="edit-type">
                                        <option value="Primary" ${school.type === 'Primary' ? 'selected' : ''}>Primary School</option>
                                        <option value="Secondary" ${school.type === 'Secondary' ? 'selected' : ''}>Secondary School</option>
                                        <option value="High School" ${school.type === 'High School' ? 'selected' : ''}>High School</option>
                                        <option value="College" ${school.type === 'College' ? 'selected' : ''}>College</option>
                                        <option value="ERP" ${school.type === 'ERP' ? 'selected' : ''}>RollCall ERP</option>
                                    </select>
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">Status</label>
                                    <select class="form-select" id="edit-status">
                                        <option value="Active" ${school.status === 'Active' ? 'selected' : ''}>Active</option>
                                        <option value="Pending" ${school.status === 'Pending' ? 'selected' : ''}>Pending</option>
                                        <option value="Suspended" ${school.status === 'Suspended' ? 'selected' : ''}>Suspended</option>
                                    </select>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Phone</label>
                                    <input type="text" class="form-control" id="edit-phone" value="${school.contacts && school.contacts.phone ? school.contacts.phone : ''}">
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">Admin Username</label>
                                    <input type="text" class="form-control" id="edit-admin-username" value="${school.admin && school.admin.username ? school.admin.username : ''}">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Admin Email</label>
                                    <input type="email" class="form-control" id="edit-admin-email" value="${school.admin && school.admin.email ? school.admin.email : ''}">
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">Current Students</label>
                                    <input type="number" class="form-control" id="edit-students" value="${school.details && school.details.currentStudents ? school.details.currentStudents : '0'}">
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="saveEditedSchool('${id}', '${school.schoolId || id}')">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>`;
            
            // Remove any existing modal
            const existingModal = document.getElementById('editSchoolModal');
            if (existingModal) {
                existingModal.remove();
            }
            
            // Add modal to document
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('editSchoolModal'));
            modal.show();
        })
        .catch(error => {
            console.error("Error loading school data:", error);
            showAlert("Error loading school data: " + error.message, "danger");
        });
}

function saveEditedSchool(ownerId, schoolId) {
    console.log("Saving edited school:", ownerId, schoolId);
    
    // Get values from form
    const name = document.getElementById('edit-name').value;
    const type = document.getElementById('edit-type').value;
    const status = document.getElementById('edit-status').value;
    const phone = document.getElementById('edit-phone').value;
    const adminUsername = document.getElementById('edit-admin-username').value;
    const adminEmail = document.getElementById('edit-admin-email').value;
    const students = document.getElementById('edit-students').value;
    
    // Create updates object
    const updates = {
        name: name,
        type: type,
        institutionType: type.toLowerCase(),
        status: status,
        'contacts/phone': phone,
        'admin/username': adminUsername,
        'admin/email': adminEmail,
        'details/currentStudents': students,
        lastUpdated: new Date().toISOString()
    };
    
    // Update in owner's database
    ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + ownerId).update(updates)
        .then(() => {
            console.log("Updated in owner's database");
            
            // Also update in schools database if possible
            if (database && schoolId) {
                database.ref('schools/' + schoolId).update(updates)
                    .then(() => {
                        console.log("Updated in schools database");
                    })
                    .catch(error => {
                        console.error("Error updating in schools database:", error);
                    });
            }
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editSchoolModal'));
            if (modal) {
                modal.hide();
            }
            
            // Show success message
            showAlert("School updated successfully", "success");
            
            // Refresh schools list
            refreshSchoolsList();
            
            // Update dashboard stats
            updateDashboardStats();
        })
        .catch(error => {
            console.error("Error updating school:", error);
            showAlert("Error updating school: " + error.message, "danger");
        });
}