// Function to refresh the schools list
function refreshSchoolsList() {
    loadSchoolsFromOwner();
    showAlert('Schools list refreshed', 'success');
}

// Function to navigate to registration section
function goToRegistration() {
    switchSection('registration');
}

// Function to view school details
function viewSchool(schoolId) {
    if (!currentUser || !ownerAuth) {
        showAlert('Please log in to view school details', 'warning');
        return;
    }
    
    ownerAuth.database().ref('owners/' + currentUser.uid + '/schools/' + schoolId).once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                const school = snapshot.val();
                // Here you would show a modal with school details
                showAlert(`Viewing details for ${school.name}`, 'info');
                // In a real implementation, you would populate and show a modal
            } else {
                showAlert('School not found', 'danger');
            }
        })
        .catch(error => {
            console.error('Error loading school details:', error);
            showAlert('Error loading school details: ' + error.message, 'danger');
        });
}

// Function to edit school
function editSchool(schoolId) {
    if (!currentUser || !ownerAuth) {
        showAlert('Please log in to edit school', 'warning');
        return;
    }
    
    showAlert(`Edit functionality for school ID: ${schoolId} will be implemented soon`, 'info');
    // In a real implementation, you would populate a form with school data and allow editing
}

// Function to load schools into the table
function loadSchoolsTable() {
    const tableBody = document.getElementById('schoolsTableBody');
    if (!tableBody) return;
    
    // Clear table
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Loading schools...</td></tr>';
    
    // Check if owner is logged in
    if (!currentUser || !ownerAuth) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Please log in to view schools</td></tr>';
        return;
    }
    
    // Get schools from owner's Firebase
    ownerAuth.database().ref('owners/' + currentUser.uid + '/schools').once('value')
        .then(snapshot => {
            if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No schools found</td></tr>';
                return;
            }
            
            // Clear table again before adding rows
            tableBody.innerHTML = '';
            
            // Add each school to table
            const schools = snapshot.val();
            Object.keys(schools).forEach(key => {
                const school = schools[key];
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${school.name || 'N/A'}</td>
                    <td>${school.address ? (school.address.city + ', ' + school.address.state) : 'N/A'}</td>
                    <td>${school.contacts ? (school.contacts.phone || (school.contacts.principal ? school.contacts.principal.phone : 'N/A')) : 'N/A'}</td>
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
                
                tableBody.appendChild(row);
            });
            
            // Update dashboard stats after loading schools
            updateDashboardStats();
        })
        .catch(error => {
            console.error('Error loading schools:', error);
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error: ${error.message}</td></tr>`;
        });
}

// Update dashboard stats based on schools data
function updateDashboardStats() {
    if (!currentUser || !ownerAuth) return;
    
    ownerAuth.database().ref('owners/' + currentUser.uid + '/schools').once('value')
        .then(snapshot => {
            const totalSchoolsCount = document.getElementById('totalSchoolsCount');
            const activeSchoolsCount = document.getElementById('activeSchoolsCount');
            const pendingRegistrationsCount = document.getElementById('pendingRegistrationsCount');
            
            if (!snapshot.exists()) {
                if (totalSchoolsCount) totalSchoolsCount.textContent = '0';
                if (activeSchoolsCount) activeSchoolsCount.textContent = '0';
                if (pendingRegistrationsCount) pendingRegistrationsCount.textContent = '0';
                return;
            }
            
            const schools = snapshot.val();
            const schoolsArray = Object.values(schools);
            
            // Update total schools count
            if (totalSchoolsCount) {
                totalSchoolsCount.textContent = schoolsArray.length;
            }
            
            // Update active schools count
            if (activeSchoolsCount) {
                const activeCount = schoolsArray.filter(school => 
                    school.status === 'Active' || school.status === 'active'
                ).length;
                activeSchoolsCount.textContent = activeCount;
            }
            
            // Update pending registrations count
            if (pendingRegistrationsCount) {
                const pendingCount = schoolsArray.filter(school => 
                    school.status === 'Pending' || school.status === 'pending'
                ).length;
                pendingRegistrationsCount.textContent = pendingCount;
            }
        })
        .catch(error => {
            console.error('Error updating dashboard stats:', error);
        });
}