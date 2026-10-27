// Add enhanced features for teachers
document.addEventListener('DOMContentLoaded', function() {
    // Add attendance rate calculation
    const calculateAttendanceRate = function() {
        // The teacher dashboard owns this value and calculates it from
        // unique marked attendance records. Do not overwrite it with the
        // legacy present/students calculation.
        if (document.getElementById('dashboardSection')) return;
        const presentCount = parseInt(document.getElementById('todayPresentCount')?.textContent || '0');
        const studentCount = parseInt(document.getElementById('totalStudentCount')?.textContent || '0');
        
        if (studentCount > 0) {
            const attendanceRate = Math.round((presentCount / studentCount) * 100);
            
            // Create or update attendance rate card
            let rateCard = document.getElementById('attendanceRateCard');
            if (!rateCard) {
                const dashboardStats = document.querySelector('.dashboard-stats');
                if (dashboardStats) {
                    rateCard = document.createElement('div');
                    rateCard.id = 'attendanceRateCard';
                    rateCard.className = 'summary-card';
                    rateCard.innerHTML = `
                        <i class="fas fa-chart-line"></i>
                        <div>
                            <h4>Attendance Rate</h4>
                            <div id="attendanceRateCount" class="count">0%</div>
                        </div>
                    `;
                    dashboardStats.appendChild(rateCard);
                }
            }
            
            // Update the rate
            const rateElement = document.getElementById('attendanceRateCount');
            if (rateElement) {
                rateElement.textContent = `${attendanceRate}%`;
            }
        }
    };
    
    // Add quick actions section if it doesn't exist
    const addQuickActions = function() {
        if (document.querySelector('.quick-actions')) return;
        
        const dashboardSection = document.getElementById('dashboardSection');
        const recentActivity = dashboardSection?.querySelector('.recent-activity');
        
        if (dashboardSection && recentActivity) {
            // Create quick actions container
            const quickActions = document.createElement('div');
            quickActions.className = 'quick-actions';
            quickActions.innerHTML = `
                <h2><i class="fas fa-bolt"></i> Quick Actions</h2>
                <div class="action-buttons">
                    <button id="quickTakeAttendanceBtn" class="action-btn">
                        <i class="fas fa-clipboard-check"></i>
                        <span>Take Attendance</span>
                    </button>
                    <button id="quickViewReportsBtn" class="action-btn">
                        <i class="fas fa-chart-bar"></i>
                        <span>View Reports</span>
                    </button>
                    <button id="quickMessageBtn" class="action-btn">
                        <i class="fas fa-envelope"></i>
                        <span>Message Students</span>
                    </button>
                    <button id="quickExportBtn" class="action-btn">
                        <i class="fas fa-file-export"></i>
                        <span>Export Data</span>
                    </button>
                </div>
            `;
            
            // Recent Activity is inside the dashboard lower-grid after the
            // redesign. Insert into its actual parent to avoid NotFoundError.
            const insertionParent = recentActivity.parentElement || dashboardSection;
            insertionParent.insertBefore(quickActions, recentActivity);
            
            // Add event listeners
            document.getElementById('quickTakeAttendanceBtn')?.addEventListener('click', function() {
                const attendanceMenuItem = document.querySelector('.menu-item[data-section="attendance"]');
                if (attendanceMenuItem) attendanceMenuItem.click();
            });
            
            document.getElementById('quickViewReportsBtn')?.addEventListener('click', function() {
                const reportsMenuItem = document.querySelector('.menu-item[data-section="reports"]');
                if (reportsMenuItem) reportsMenuItem.click();
            });
        }
    };
    
    // Add bulk actions for attendance marking
    const addBulkActions = function() {
        if (document.querySelector('.bulk-actions')) return;
        
        // Create bulk actions container
        const bulkActions = document.createElement('div');
        bulkActions.className = 'bulk-actions';
        bulkActions.id = 'attendanceBulkActions';
        bulkActions.innerHTML = `
            <button id="markAllPresentBtn" class="bulk-action-btn">
                <i class="fas fa-check-circle"></i> Mark All Present
            </button>
            <button id="markAllAbsentBtn" class="bulk-action-btn">
                <i class="fas fa-times-circle"></i> Mark All Absent
            </button>
            <button id="resetAttendanceBtn" class="bulk-action-btn">
                <i class="fas fa-undo"></i> Reset
            </button>
        `;
        
        // Insert bulk actions before student list
        const studentList = document.getElementById('studentList');
        if (studentList && studentList.parentNode) {
            studentList.parentNode.insertBefore(bulkActions, studentList);
        }
        
        // Add event listeners
        document.getElementById('markAllPresentBtn')?.addEventListener('click', function() {
            markAllAttendance('present');
        });
        
        document.getElementById('markAllAbsentBtn')?.addEventListener('click', function() {
            markAllAttendance('absent');
        });
        
        document.getElementById('resetAttendanceBtn')?.addEventListener('click', function() {
            resetAllAttendance();
        });
    };
    
    // Mark all students with the same attendance status
    window.markAllAttendance = function(status) {
        if (!window.students || !window.attendanceData) return;
        
        // Update all students in the attendance data
        window.students.forEach(student => {
            window.attendanceData[student.id] = status;
        });
        
        // Update UI for all buttons
        const allButtons = document.querySelectorAll('.attendance-btn');
        allButtons.forEach(btn => {
            if (btn.getAttribute('data-status') === status) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Show feedback message
        const statusText = status === 'present' ? 'present' : 'absent';
        const alertElement = document.getElementById('attendanceAlert') || document.getElementById('dashboardAlert');
        if (alertElement) {
            showAlert(alertElement, `<i class="fas fa-check-circle"></i> All students marked as ${statusText}`, 'success');
        }
    };
    
    // Reset all attendance marks
    window.resetAllAttendance = function() {
        if (!window.attendanceData) return;
        
        // Clear attendance data
        window.attendanceData = {};
        
        // Remove active class from all buttons
        const allButtons = document.querySelectorAll('.attendance-btn');
        allButtons.forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Show feedback message
        const alertElement = document.getElementById('attendanceAlert') || document.getElementById('dashboardAlert');
        if (alertElement) {
            showAlert(alertElement, '<i class="fas fa-undo"></i> Attendance reset', 'info');
        }
    };
    
    // Helper function to show alerts
    window.showAlert = function(element, message, type) {
        if (!element) return;
        
        element.innerHTML = message;
        element.className = `alert alert-${type}`;
        element.style.display = 'block';
        
        // Hide alert after 5 seconds
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    };
    
    // Add styles for new features
    const addStyles = function() {
        if (document.getElementById('teacher-features-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'teacher-features-styles';
        style.textContent = `
            .quick-actions {
                margin-top: 30px;
                background: white;
                border-radius: 16px;
                padding: 25px;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
                border: 1px solid rgba(0, 0, 0, 0.05);
            }
            
            .action-buttons {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 20px;
                margin-top: 20px;
            }
            
            .action-btn {
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                color: #495057;
                border: 1px solid #dee2e6;
                border-radius: 12px;
                padding: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 15px;
                transition: all 0.3s ease;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
                width: 100%;
            }
            
            .action-btn i {
                font-size: 24px;
                color: #66bb6a;
                background: rgba(102, 187, 106, 0.1);
                width: 50px;
                height: 50px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
            }
            
            .action-btn span {
                font-weight: 600;
                font-size: 16px;
            }
            
            .action-btn:hover {
                transform: translateY(-5px);
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
                background: linear-gradient(135deg, #e9ecef, #dee2e6);
            }
            
            .bulk-actions {
                margin-top: 20px;
                margin-bottom: 20px;
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }
            
            .bulk-action-btn {
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                color: #495057;
                border: 1px solid #dee2e6;
                padding: 10px 15px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.3s ease;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .bulk-action-btn:hover {
                background: linear-gradient(135deg, #e9ecef, #dee2e6);
                transform: translateY(-2px);
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            }
        `;
        document.head.appendChild(style);
    };
    
    // Initialize all features
    const initFeatures = function() {
        addStyles();
        calculateAttendanceRate();
        addQuickActions();
        addBulkActions();
        
        // Observe changes to update attendance rate
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    calculateAttendanceRate();
                }
            });
        });
        
        const presentCountElement = document.getElementById('todayPresentCount');
        const studentCountElement = document.getElementById('totalStudentCount');
        
        if (presentCountElement) {
            observer.observe(presentCountElement, { childList: true, characterData: true, subtree: true });
        }
        
        if (studentCountElement) {
            observer.observe(studentCountElement, { childList: true, characterData: true, subtree: true });
        }
    };
    
    // Run after a short delay to ensure DOM is fully loaded
    setTimeout(initFeatures, 1000);
});
