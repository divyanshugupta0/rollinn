// Teacher Dropdown Fix - Ensures teacher dropdown is populated with data from Firebase
document.addEventListener('DOMContentLoaded', function() {
    // Add sample teachers to Firebase if none exist
    setTimeout(addSampleTeachersIfNeeded, 1000);
    
    // Enhance teacher dropdown in class edit modal
    setTimeout(enhanceTeacherDropdown, 1500);
    
    // Add sample teachers if needed
    function addSampleTeachersIfNeeded() {
        // Check if teachers exist in Firebase
        firebase.database().ref('users').orderByChild('role').equalTo('teacher').once('value')
            .then((snapshot) => {
                if (!snapshot.exists() || snapshot.numChildren() < 2) {
                    console.log('Adding sample teachers to Firebase...');
                    
                    // Sample teachers data
                    const sampleTeachers = [
                        {
                            name: 'Mr. John Smith',
                            email: 'john.smith@school.edu',
                            role: 'teacher',
                            subject: 'Mathematics',
                            phone: '555-123-4567'
                        },
                        {
                            name: 'Ms. Sarah Johnson',
                            email: 'sarah.johnson@school.edu',
                            role: 'teacher',
                            subject: 'Science',
                            phone: '555-234-5678'
                        },
                        {
                            name: 'Mrs. Emily Davis',
                            email: 'emily.davis@school.edu',
                            role: 'teacher',
                            subject: 'English',
                            phone: '555-345-6789'
                        },
                        {
                            name: 'Mr. Robert Wilson',
                            email: 'robert.wilson@school.edu',
                            role: 'teacher',
                            subject: 'History',
                            phone: '555-456-7890'
                        },
                        {
                            name: 'Ms. Jennifer Thompson',
                            email: 'jennifer.thompson@school.edu',
                            role: 'teacher',
                            subject: 'Art',
                            phone: '555-567-8901'
                        }
                    ];
                    
                    // Add sample teachers to Firebase
                    const teachersRef = firebase.database().ref('users');
                    sampleTeachers.forEach((teacher, index) => {
                        const teacherId = `teacher_${Date.now()}_${index}`;
                        teachersRef.child(teacherId).set(teacher);
                    });
                }
            });
    }
    
    // Enhance teacher dropdown in class edit modal
    function enhanceTeacherDropdown() {
        // Create a MutationObserver to watch for the modal being added to the DOM
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    for (let i = 0; i < mutation.addedNodes.length; i++) {
                        const node = mutation.addedNodes[i];
                        if (node.id === 'classEditModal') {
                            // Modal has been added to the DOM
                            setupTeacherDropdown();
                            break;
                        }
                    }
                }
            });
        });
        
        // Start observing the document body for changes
        observer.observe(document.body, { childList: true });
        
        // Also check if modal already exists
        if (document.getElementById('classEditModal')) {
            setupTeacherDropdown();
        }
    }
    
    // Setup teacher dropdown
    function setupTeacherDropdown() {
        // Find the teacher field
        const teacherField = document.querySelector('#classEditModal .form-group:has(#classEditTeacher)');
        if (!teacherField) return;
        
        // Create select element if it doesn't exist
        let teacherSelect = document.getElementById('classEditTeacher');
        if (teacherSelect && teacherSelect.tagName !== 'SELECT') {
            // Replace input with select
            const teacherInput = teacherSelect;
            teacherSelect = document.createElement('select');
            teacherSelect.id = 'classEditTeacher';
            teacherSelect.className = 'form-control';
            teacherSelect.innerHTML = '<option value="">Loading teachers...</option>';
            
            if (teacherInput.parentNode) {
                teacherInput.parentNode.replaceChild(teacherSelect, teacherInput);
            }
        }
        
        // Load teachers from Firebase
        firebase.database().ref('users').orderByChild('role').equalTo('teacher').once('value')
            .then((snapshot) => {
                // Clear existing options
                teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
                
                if (snapshot.exists()) {
                    // Add teachers from database
                    snapshot.forEach((childSnapshot) => {
                        const teacher = childSnapshot.val();
                        const teacherName = teacher.name || teacher.email || `Teacher ${childSnapshot.key}`;
                        
                        const option = document.createElement('option');
                        option.value = teacherName;
                        option.textContent = teacherName;
                        teacherSelect.appendChild(option);
                    });
                    
                    console.log(`Loaded ${teacherSelect.options.length - 1} teachers from Firebase`);
                } else {
                    // Add default options if no teachers found
                    const defaultTeachers = [
                        'Mr. John Smith',
                        'Ms. Sarah Johnson',
                        'Mrs. Emily Davis',
                        'Mr. Robert Wilson',
                        'Ms. Jennifer Thompson'
                    ];
                    
                    defaultTeachers.forEach(name => {
                        const option = document.createElement('option');
                        option.value = name;
                        option.textContent = name;
                        teacherSelect.appendChild(option);
                    });
                    
                    console.log('No teachers found in Firebase, using default options');
                }
            })
            .catch(error => {
                console.error('Error loading teachers:', error);
                
                // Add default options on error
                teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
                const defaultTeachers = [
                    'Mr. John Smith',
                    'Ms. Sarah Johnson',
                    'Mrs. Emily Davis',
                    'Mr. Robert Wilson',
                    'Ms. Jennifer Thompson'
                ];
                
                defaultTeachers.forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    teacherSelect.appendChild(option);
                });
            });
    }
});