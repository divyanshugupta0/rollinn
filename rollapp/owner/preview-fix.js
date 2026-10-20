// Direct fix for preview button
document.addEventListener('DOMContentLoaded', function() {
    // Find the preview button by ID
    const previewButton = document.getElementById('previewRegistrationBtn');
    
    if (previewButton) {
        previewButton.addEventListener('click', function() {
            // Get form values
            const schoolName = document.getElementById('schoolName')?.value || 'Not provided';
            const schoolCode = document.getElementById('schoolCode')?.value || 'Not provided';
            const schoolType = document.getElementById('schoolType')?.value || 'Not provided';
            
            // Create simple preview HTML
            const previewHTML = `
                <div class="modal fade" id="previewModalDirect" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">School Registration Preview</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="row">
                                    <div class="col-md-6">
                                        <h6>School Information</h6>
                                        <p><strong>Name:</strong> ${schoolName}</p>
                                        <p><strong>Code:</strong> ${schoolCode}</p>
                                        <p><strong>Type:</strong> ${schoolType}</p>
                                        <p><strong>Established Year:</strong> ${document.getElementById('establishedYear')?.value || 'Not provided'}</p>
                                        <p><strong>Address:</strong> ${document.getElementById('schoolAddress')?.value || 'Not provided'}</p>
                                        <p><strong>City:</strong> ${document.getElementById('city')?.value || 'Not provided'}</p>
                                        <p><strong>State:</strong> ${document.getElementById('state')?.value || 'Not provided'}</p>
                                    </div>
                                    <div class="col-md-6">
                                        <h6>Contact Information</h6>
                                        <p><strong>Principal:</strong> ${document.getElementById('principalName')?.value || 'Not provided'}</p>
                                        <p><strong>Email:</strong> ${document.getElementById('principalEmail')?.value || 'Not provided'}</p>
                                        <p><strong>Phone:</strong> ${document.getElementById('schoolPhone')?.value || 'Not provided'}</p>
                                        <p><strong>Alt Phone:</strong> ${document.getElementById('alternatePhone')?.value || 'Not provided'}</p>
                                    </div>
                                </div>
                                
                                <hr>
                                
                                <div class="row">
                                    <div class="col-md-6">
                                        <h6>Admin Credentials</h6>
                                        <p><strong>Admin Name:</strong> ${document.getElementById('adminName')?.value || 'Not provided'}</p>
                                        <p><strong>Admin Email:</strong> ${document.getElementById('adminEmail')?.value || 'Not provided'}</p>
                                        <p><strong>Admin Username:</strong> ${document.getElementById('adminUsername')?.value || 'Not provided'}</p>
                                        <p><strong>Admin Password:</strong> ${document.getElementById('adminPassword')?.value ? '********' : 'Not provided'}</p>
                                    </div>
                                    <div class="col-md-6">
                                        <h6>School Details</h6>
                                        <p><strong>Capacity:</strong> ${document.getElementById('studentCapacity')?.value || 'Not provided'}</p>
                                        <p><strong>Current Students:</strong> ${document.getElementById('currentStudents')?.value || '0'}</p>
                                        <p><strong>Teachers:</strong> ${document.getElementById('teacherCount')?.value || '0'}</p>
                                        <p><strong>Accreditation:</strong> ${document.getElementById('accreditation')?.value || 'Not provided'}</p>
                                        <p><strong>Website:</strong> ${document.getElementById('website')?.value || 'Not provided'}</p>
                                    </div>
                                </div>
                                
                                <hr>
                                
                                <div class="row">
                                    <div class="col-md-6">
                                        <h6>Facilities</h6>
                                        <p><strong>Library:</strong> ${document.getElementById('hasLibrary')?.checked ? 'Yes' : 'No'}</p>
                                        <p><strong>Computer Lab:</strong> ${document.getElementById('hasLab')?.checked ? 'Yes' : 'No'}</p>
                                        <p><strong>Sports:</strong> ${document.getElementById('hasSports')?.checked ? 'Yes' : 'No'}</p>
                                        <p><strong>Transportation:</strong> ${document.getElementById('hasTransport')?.checked ? 'Yes' : 'No'}</p>
                                    </div>
                                    <div class="col-md-6">
                                        <h6>Subscription</h6>
                                        <p><strong>Plan:</strong> ${document.getElementById('sparkPlan')?.checked ? 'Spark (1 month)' : 'Bullet (2 months)'}</p>
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
            
            // Remove any existing preview modal
            const existingModal = document.getElementById('previewModalDirect');
            if (existingModal) {
                existingModal.remove();
            }
            
            // Add the modal to the document
            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = previewHTML;
            document.body.appendChild(modalContainer);
            
            // Show the modal
            const previewModal = new bootstrap.Modal(document.getElementById('previewModalDirect'));
            previewModal.show();
        });
    }
});