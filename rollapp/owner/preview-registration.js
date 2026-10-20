// Preview Registration Function

function previewRegistration() {
    // Get form values
    const schoolName = document.getElementById('schoolName').value || 'Not provided';
    const schoolCode = document.getElementById('schoolCode').value || 'Not provided';
    const schoolType = document.getElementById('schoolType').value || 'Not provided';
    const establishedYear = document.getElementById('establishedYear').value || 'Not provided';
    
    // Address
    const address = document.getElementById('schoolAddress').value || 'Not provided';
    const city = document.getElementById('city').value || 'Not provided';
    const state = document.getElementById('state').value || 'Not provided';
    const zipCode = document.getElementById('zipCode').value || 'Not provided';
    
    // Contacts
    const principalName = document.getElementById('principalName').value || 'Not provided';
    const principalEmail = document.getElementById('principalEmail').value || 'Not provided';
    const schoolPhone = document.getElementById('schoolPhone').value || 'Not provided';
    const alternatePhone = document.getElementById('alternatePhone').value || 'Not provided';
    
    // Admin
    const adminName = document.getElementById('adminName').value || 'Not provided';
    const adminEmail = document.getElementById('adminEmail').value || 'Not provided';
    const adminUsername = document.getElementById('adminUsername').value || 'Not provided';
    
    // School details
    const capacity = document.getElementById('studentCapacity').value || 'Not provided';
    const currentStudents = document.getElementById('currentStudents').value || '0';
    const teacherCount = document.getElementById('teacherCount').value || '0';
    const accreditation = document.getElementById('accreditation').value || 'Not provided';
    const website = document.getElementById('website').value || 'Not provided';
    
    // Facilities
    const hasLibrary = document.getElementById('hasLibrary').checked;
    const hasLab = document.getElementById('hasLab').checked;
    const hasSports = document.getElementById('hasSports').checked;
    const hasTransport = document.getElementById('hasTransport').checked;
    
    // Subscription
    const subscriptionPlan = document.getElementById('sparkPlan').checked ? 'Spark (1 month)' : 'Bullet (2 months)';
    
    // Create modal HTML
    const modalHTML = `
        <div class="modal fade" id="previewModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Registration Preview</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="fw-bold">School Information</h6>
                                <p><strong>Name:</strong> ${schoolName}</p>
                                <p><strong>Code:</strong> ${schoolCode}</p>
                                <p><strong>Type:</strong> ${schoolType}</p>
                                <p><strong>Established Year:</strong> ${establishedYear}</p>
                                <p><strong>Address:</strong> ${address}</p>
                                <p><strong>Location:</strong> ${city}, ${state} ${zipCode}</p>
                            </div>
                            <div class="col-md-6">
                                <h6 class="fw-bold">Contact Information</h6>
                                <p><strong>Principal:</strong> ${principalName}</p>
                                <p><strong>Principal Email:</strong> ${principalEmail}</p>
                                <p><strong>Phone:</strong> ${schoolPhone}</p>
                                <p><strong>Alt. Phone:</strong> ${alternatePhone}</p>
                                <p><strong>Admin:</strong> ${adminName}</p>
                                <p><strong>Admin Email:</strong> ${adminEmail}</p>
                                <p><strong>Admin Username:</strong> ${adminUsername}</p>
                            </div>
                        </div>
                        <hr>
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="fw-bold">School Details</h6>
                                <p><strong>Student Capacity:</strong> ${capacity}</p>
                                <p><strong>Current Students:</strong> ${currentStudents}</p>
                                <p><strong>Teachers:</strong> ${teacherCount}</p>
                                <p><strong>Accreditation:</strong> ${accreditation}</p>
                                <p><strong>Website:</strong> ${website}</p>
                            </div>
                            <div class="col-md-6">
                                <h6 class="fw-bold">Facilities & Subscription</h6>
                                <p><strong>Library:</strong> ${hasLibrary ? 'Yes' : 'No'}</p>
                                <p><strong>Computer Lab:</strong> ${hasLab ? 'Yes' : 'No'}</p>
                                <p><strong>Sports Facility:</strong> ${hasSports ? 'Yes' : 'No'}</p>
                                <p><strong>Transportation:</strong> ${hasTransport ? 'Yes' : 'No'}</p>
                                <p><strong>Subscription Plan:</strong> ${subscriptionPlan}</p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
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