// Simple direct implementation for view school functionality
function viewSchool(id) {
    console.log("View school function called for ID:", id);
    
    if (!currentUser || !ownerAuth) {
        showAlert("You must be logged in to view schools", "danger");
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
            
            // Get admin password from schoolAdmins if available
            let passwordPromise;
            if (database && school.schoolId) {
                passwordPromise = database.ref('schoolAdmins/' + school.schoolId).once('value');
            } else {
                passwordPromise = Promise.resolve(null);
            }
            
            passwordPromise.then(adminSnapshot => {
                let adminPassword = "Not available";
                if (adminSnapshot && adminSnapshot.exists() && adminSnapshot.val().password) {
                    adminPassword = adminSnapshot.val().password;
                }
                
                // Create view modal HTML
                const modalHTML = `
                <div class="modal fade" id="viewSchoolModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">School Details: ${school.name}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="row mb-3">
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
                                        <p><strong>Password:</strong> ${adminPassword}</p>
                                    </div>
                                </div>
                                <hr>
                                <div class="row mb-3">
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
                                <hr>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <h6>Statistics</h6>
                                        <p><strong>Student Capacity:</strong> ${school.details ? school.details.capacity : 'N/A'}</p>
                                        <p><strong>Current Students:</strong> ${school.details ? school.details.currentStudents : '0'}</p>
                                        <p><strong>Teachers:</strong> ${school.details ? school.details.teacherCount : '0'}</p>
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
                
                // Remove any existing modal
                const existingModal = document.getElementById('viewSchoolModal');
                if (existingModal) {
                    existingModal.remove();
                }
                
                // Add modal to document
                document.body.insertAdjacentHTML('beforeend', modalHTML);
                
                // Show modal
                const modal = new bootstrap.Modal(document.getElementById('viewSchoolModal'));
                modal.show();
            }).catch(error => {
                console.error("Error getting admin password:", error);
                showAlert("Error getting admin details: " + error.message, "danger");
            });
        })
        .catch(error => {
            console.error("Error loading school data:", error);
            showAlert("Error loading school data: " + error.message, "danger");
        });
}