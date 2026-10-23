// Direct fix for schools display and functionality
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        refreshSchoolsList();
        updateDashboardStats();
    }, 2000);
    
    const schoolsTab = document.querySelector('a[href="#schools"]');
    if (schoolsTab) {
        schoolsTab.addEventListener('click', refreshSchoolsList);
    }
});

// Refresh schools list
function refreshSchoolsList() {
    const schoolsTableBody = document.getElementById('schoolsTableBody');
    if (!schoolsTableBody) return;
    
    schoolsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Loading schools...</td></tr>';
    
    if (currentUser && ownerAuth) {
        ownerAuth.database().ref('owners/' + currentUser.uid + '/schools').once('value')
            .then(snapshot => {
                if (snapshot.exists()) {
                    schoolsTableBody.innerHTML = '';
                    const schools = snapshot.val();
                    Object.keys(schools).forEach(key => {
                        const school = schools[key];
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${school.name || 'N/A'}</td>
                            <td>${school.address ? (school.address.city + ', ' + school.address.state) : 'N/A'}</td>
                            <td>${school.contacts ? school.contacts.phone : 'N/A'}</td>
                            <td><span class="badge bg-success">${school.status || 'Active'}</span></td>
                            <td>${school.details ? school.details.currentStudents : '0'}</td>
                            <td>
                                <button class="btn btn-sm btn-info me-1" onclick="viewSchool('${key}')">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn btn-sm btn-warning me-1" onclick="editSchool('${key}')">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteSchool('${key}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        `;
                        schoolsTableBody.appendChild(row);
                    });
                    updateDashboardStats();
                } else {
                    schoolsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">No schools found</td></tr>';
                }
            })
            .catch(error => {
                schoolsTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error: ${error.message}</td></tr>`;
            });
    } else {
        schoolsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Please log in to view schools</td></tr>';
    }
}

// Update dashboard stats
function updateDashboardStats() {
    if (!currentUser || !ownerAuth) return;
    
    ownerAuth.database().ref('owners/' + currentUser.uid + '/schools').once('value')
        .then(snapshot => {
            if (!snapshot.exists()) {
                document.getElementById('totalSchoolsCount').textContent = '0';
                document.getElementById('activeSchoolsCount').textContent = '0';
                document.getElementById('pendingRegistrationsCount').textContent = '0';
                return;
            }
            
            const schools = snapshot.val();
            const schoolsArray = Object.values(schools);
            
            document.getElementById('totalSchoolsCount').textContent = schoolsArray.length;
            
            const activeCount = schoolsArray.filter(school => 
                school.status === 'Active' || school.status === 'active'
            ).length;
            document.getElementById('activeSchoolsCount').textContent = activeCount;
            
            const pendingCount = schoolsArray.filter(school => 
                school.status === 'Pending' || school.status === 'pending'
            ).length;
            document.getElementById('pendingRegistrationsCount').textContent = pendingCount;
        });
}

function goToRegistration() {
    switchSection('registration');
}

// View school details
function viewSchool(id) {
    if (!currentUser || !ownerAuth) return;
    
    ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + id).once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                const school = snapshot.val();
                
                let modalHTML = `
                <div class="modal fade" id="viewSchoolModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">School Details: ${school.name}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="row">
                                    <div class="col-md-6">
                                        <h6>Basic Information</h6>
                                        <p><strong>Name:</strong> ${school.name || 'N/A'}</p>
                                        <p><strong>Code:</strong> ${school.code || 'N/A'}</p>
                                        <p><strong>Type:</strong> ${school.type || 'N/A'}</p>
                                        <p><strong>Status:</strong> <span class="badge bg-success">${school.status || 'Active'}</span></p>
                                    </div>
                                    <div class="col-md-6">
                                        <h6>Admin Information</h6>
                                        <p><strong>Username:</strong> ${school.admin ? school.admin.username : (school.adminInfo ? school.adminInfo.username : 'N/A')}</p>
                                        <p><strong>Email:</strong> ${school.admin ? school.admin.email : (school.adminInfo ? school.adminInfo.email : 'N/A')}</p>
                                    </div>
                                </div>
                                <hr>
                                <div class="row">
                                    <div class="col-md-6">
                                        <h6>Contact Information</h6>
                                        <p><strong>Address:</strong> ${school.address ? school.address.complete : 'N/A'}</p>
                                        <p><strong>City:</strong> ${school.address ? school.address.city : 'N/A'}</p>
                                        <p><strong>State:</strong> ${school.address ? school.address.state : 'N/A'}</p>
                                        <p><strong>Phone:</strong> ${school.contacts ? school.contacts.phone : 'N/A'}</p>
                                    </div>
                                    <div class="col-md-6">
                                        <h6>Subscription Details</h6>
                                        <p><strong>Plan:</strong> ${school.subscription ? school.subscription.plan : 'N/A'}</p>
                                        <p><strong>Start Date:</strong> ${school.subscription ? new Date(school.subscription.startDate).toLocaleDateString() : 'N/A'}</p>
                                        <p><strong>End Date:</strong> ${school.subscription ? new Date(school.subscription.endDate).toLocaleDateString() : 'N/A'}</p>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                                <button type="button" class="btn btn-warning" onclick="editSchool('${id}')">Edit School</button>
                            </div>
                        </div>
                    </div>
                </div>`;
                
                // Remove existing modal if any
                const existingModal = document.getElementById('viewSchoolModal');
                if (existingModal) {
                    existingModal.remove();
                }
                
                // Add modal to body
                const modalElement = document.createElement('div');
                modalElement.innerHTML = modalHTML;
                document.body.appendChild(modalElement.firstElementChild);
                
                // Show modal
                const modal = new bootstrap.Modal(document.getElementById('viewSchoolModal'));
                modal.show();
            }
        });
}

// Edit school
function editSchool(id) {
    if (!currentUser || !ownerAuth) return;
    
    // Close view modal if open
    const viewModal = document.getElementById('viewSchoolModal');
    if (viewModal) {
        const bsViewModal = bootstrap.Modal.getInstance(viewModal);
        if (bsViewModal) bsViewModal.hide();
    }
    
    ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + id).once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                const school = snapshot.val();
                
                let modalHTML = `
                <div class="modal fade" id="editSchoolModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Edit School: ${school.name}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <form id="editSchoolForm">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="editSchoolName" class="form-label">School Name</label>
                                                <input type="text" class="form-control" id="editSchoolName" value="${school.name || ''}">
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="editSchoolType" class="form-label">School Type</label>
                                                <select class="form-select" id="editSchoolType">
                                                    <option value="Primary" ${school.type === 'Primary' ? 'selected' : ''}>Primary School</option>
                                                    <option value="Secondary" ${school.type === 'Secondary' ? 'selected' : ''}>Secondary School</option>
                                                    <option value="High School" ${school.type === 'High School' ? 'selected' : ''}>High School</option>
                                                    <option value="College" ${school.type === 'College' ? 'selected' : ''}>College</option>
                                                    <option value="University" ${school.type === 'University' ? 'selected' : ''}>University</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="editSchoolStatus" class="form-label">Status</label>
                                                <select class="form-select" id="editSchoolStatus">
                                                    <option value="Active" ${school.status === 'Active' ? 'selected' : ''}>Active</option>
                                                    <option value="Pending" ${school.status === 'Pending' ? 'selected' : ''}>Pending</option>
                                                    <option value="Suspended" ${school.status === 'Suspended' ? 'selected' : ''}>Suspended</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="editSchoolPhone" class="form-label">Phone</label>
                                                <input type="text" class="form-control" id="editSchoolPhone" value="${school.contacts ? school.contacts.phone || '' : ''}">
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="editAdminUsername" class="form-label">Admin Username</label>
                                                <input type="text" class="form-control" id="editAdminUsername" value="${school.admin ? school.admin.username : (school.adminInfo ? school.adminInfo.username : '')}">
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="editAdminEmail" class="form-label">Admin Email</label>
                                                <input type="email" class="form-control" id="editAdminEmail" value="${school.admin ? school.admin.email : (school.adminInfo ? school.adminInfo.email : '')}">
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="editCurrentStudents" class="form-label">Current Students</label>
                                                <input type="number" class="form-control" id="editCurrentStudents" value="${school.details ? school.details.currentStudents || '0' : '0'}">
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-primary" onclick="saveSchoolChanges('${id}', '${school.schoolId || id}')">Save Changes</button>
                            </div>
                        </div>
                    </div>
                </div>`;
                
                // Remove existing modal if any
                const existingModal = document.getElementById('editSchoolModal');
                if (existingModal) {
                    existingModal.remove();
                }
                
                // Add modal to body
                const modalElement = document.createElement('div');
                modalElement.innerHTML = modalHTML;
                document.body.appendChild(modalElement.firstElementChild);
                
                // Show modal after a short delay to avoid conflicts
                setTimeout(() => {
                    const modal = new bootstrap.Modal(document.getElementById('editSchoolModal'));
                    modal.show();
                }, 300);
            }
        });
}

// Save school changes
function saveSchoolChanges(ownerId, schoolId) {
    if (!currentUser || !ownerAuth) return;
    
    const name = document.getElementById('editSchoolName').value;
    const type = document.getElementById('editSchoolType').value;
    const status = document.getElementById('editSchoolStatus').value;
    const phone = document.getElementById('editSchoolPhone').value;
    const adminUsername = document.getElementById('editAdminUsername').value;
    const adminEmail = document.getElementById('editAdminEmail').value;
    const currentStudents = document.getElementById('editCurrentStudents').value;
    
    // Update in owner's database
    const ownerUpdates = {};
    ownerUpdates['name'] = name;
    ownerUpdates['type'] = type;
    ownerUpdates['institutionType'] = type.toLowerCase();
    ownerUpdates['status'] = status;
    ownerUpdates['contacts/phone'] = phone;
    ownerUpdates['admin/username'] = adminUsername;
    ownerUpdates['admin/email'] = adminEmail;
    ownerUpdates['details/currentStudents'] = currentStudents;
    ownerUpdates['lastUpdated'] = new Date().toISOString();
    
    ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + ownerId).update(ownerUpdates)
        .then(() => {
            // Also update in schools database if possible
            if (database && schoolId) {
                const schoolUpdates = {};
                schoolUpdates['name'] = name;
                schoolUpdates['type'] = type;
                schoolUpdates['institutionType'] = type.toLowerCase();
                schoolUpdates['status'] = status;
                schoolUpdates['contacts/phone'] = phone;
                schoolUpdates['admin/username'] = adminUsername;
                schoolUpdates['admin/email'] = adminEmail;
                schoolUpdates['details/currentStudents'] = currentStudents;
                schoolUpdates['lastUpdated'] = new Date().toISOString();
                
                database.ref('schools/' + schoolId).update(schoolUpdates)
                    .catch(error => {
                        console.error('Error updating school in main database:', error);
                    });
            }
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editSchoolModal'));
            if (modal) {
                modal.hide();
            }
            
            showAlert('School updated successfully', 'success');
            refreshSchoolsList();
            updateDashboardStats();
        })
        .catch(error => {
            console.error('Error updating school:', error);
            showAlert('Error updating school: ' + error.message, 'danger');
        });
}

// Delete school
function deleteSchool(id) {
    if (!currentUser || !ownerAuth) return;
    
    if (confirm("Are you sure you want to delete this school?")) {
        ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + id).once('value')
            .then(snapshot => {
                const school = snapshot.val();
                const schoolId = school.schoolId || id;
                
                // Delete from owner's database
                ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + id).remove()
                    .then(() => {
                        // Also delete from schools database if possible
                        if (database && schoolId) {
                            database.ref('schools/' + schoolId).remove()
                                .catch(error => {
                                    console.error('Error deleting school from main database:', error);
                                });
                        }
                        
                        showAlert("School deleted successfully", "success");
                        refreshSchoolsList();
                        updateDashboardStats();
                    })
                    .catch(error => {
                        console.error('Error deleting school:', error);
                        showAlert("Error deleting school: " + error.message, "danger");
                    });
            });
    }
}