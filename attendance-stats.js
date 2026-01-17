// Attendance Statistics - Adds enhanced reporting features
document.addEventListener('DOMContentLoaded', function() {
    // Initialize reports section
    enhanceReportsSection();
    
    function enhanceReportsSection() {
        const reportsSection = document.getElementById('reportsSection');
        if (!reportsSection) return;
        
        // Add statistics cards
        addStatisticsCards();
        
        // Add chart containers
        addChartContainers();
        
        // Add export options
        addExportOptions();
        
        // Add event listeners
        document.getElementById('generateReportBtn')?.addEventListener('click', generateReport);
    }
    
    // Add statistics cards
    function addStatisticsCards() {
        const reportsSection = document.getElementById('reportsSection');
        const reportResults = document.getElementById('reportResults');
        
        if (!reportsSection || !reportResults) return;
        
        // Create stats container
        const statsContainer = document.createElement('div');
        statsContainer.className = 'stats-container';
        statsContainer.innerHTML = `
            <div class="stats-card">
                <div class="stats-icon">
                    <i class="fas fa-user-check"></i>
                </div>
                <div class="stats-content">
                    <div class="stats-value" id="totalPresentCount">-</div>
                    <div class="stats-label">Present</div>
                </div>
            </div>
            
            <div class="stats-card">
                <div class="stats-icon">
                    <i class="fas fa-user-times"></i>
                </div>
                <div class="stats-content">
                    <div class="stats-value" id="totalAbsentCount">-</div>
                    <div class="stats-label">Absent</div>
                </div>
            </div>
            
            <div class="stats-card">
                <div class="stats-icon">
                    <i class="fas fa-percentage"></i>
                </div>
                <div class="stats-content">
                    <div class="stats-value" id="attendanceRateValue">-</div>
                    <div class="stats-label">Attendance Rate</div>
                </div>
            </div>
            
            <div class="stats-card">
                <div class="stats-icon">
                    <i class="fas fa-calendar-check"></i>
                </div>
                <div class="stats-content">
                    <div class="stats-value" id="totalClassesCount">-</div>
                    <div class="stats-label">Classes</div>
                </div>
            </div>
        `;
        
        // Insert before report results
        reportResults.parentNode.insertBefore(statsContainer, reportResults);
    }
    
    // Add chart containers
    function addChartContainers() {
        const reportsSection = document.getElementById('reportsSection');
        const reportResults = document.getElementById('reportResults');
        
        if (!reportsSection || !reportResults) return;
        
        // Create charts container
        const chartsContainer = document.createElement('div');
        chartsContainer.className = 'report-charts';
        chartsContainer.id = 'reportCharts';
        chartsContainer.style.display = 'none';
        chartsContainer.innerHTML = `
            <div class="chart-container">
                <h3><i class="fas fa-chart-pie"></i> Attendance Overview</h3>
                <div id="attendancePieChart" class="chart"></div>
            </div>
            
            <div class="chart-container">
                <h3><i class="fas fa-chart-bar"></i> Daily Attendance</h3>
                <div id="attendanceBarChart" class="chart"></div>
            </div>
            
            <div class="chart-container">
                <h3><i class="fas fa-chart-line"></i> Attendance Trend</h3>
                <div id="attendanceTrendChart" class="chart"></div>
            </div>
            
            <div class="chart-container">
                <h3><i class="fas fa-user-graduate"></i> Student Performance</h3>
                <div id="studentPerformanceChart" class="chart"></div>
            </div>
        `;
        
        // Insert after report results
        reportResults.parentNode.insertBefore(chartsContainer, reportResults.nextSibling);
    }
    
    // Add export options
    function addExportOptions() {
        const reportsFilters = document.querySelector('.reports-filters');
        if (!reportsFilters) return;
        
        // Create export options
        const exportOptions = document.createElement('div');
        exportOptions.className = 'export-options';
        exportOptions.innerHTML = `
            <div class="form-group">
                <label for="reportFormat"><i class="fas fa-file-export"></i> Export Format</label>
                <select id="reportFormat" class="form-control">
                    <option value="none">View Only</option>
                    <option value="csv">CSV</option>
                    <option value="pdf">PDF</option>
                    <option value="excel">Excel</option>
                </select>
            </div>
            
            <div class="export-actions">
                <button id="exportReportBtn" class="secondary-btn">
                    <i class="fas fa-file-export"></i> Export
                </button>
                <button id="printReportBtn" class="secondary-btn">
                    <i class="fas fa-print"></i> Print
                </button>
                <button id="emailReportBtn" class="secondary-btn">
                    <i class="fas fa-envelope"></i> Email
                </button>
            </div>
        `;
        
        // Append to reports filters
        reportsFilters.appendChild(exportOptions);
        
        // Add event listeners
        document.getElementById('exportReportBtn')?.addEventListener('click', exportReport);
        document.getElementById('printReportBtn')?.addEventListener('click', printReport);
        document.getElementById('emailReportBtn')?.addEventListener('click', emailReport);
    }
    
    // Generate report
    function generateReport() {
        const reportResults = document.getElementById('reportResults');
        const reportCharts = document.getElementById('reportCharts');
        
        if (!reportResults || !reportCharts) return;
        
        // Show loading state
        reportResults.innerHTML = `
            <div class="loader-container">
                <div class="loader"></div>
                <div class="loader-text">Generating report...</div>
            </div>
        `;
        
        // Get filter values
        const classSelect = document.getElementById('reportClassSelect');
        const startDate = document.getElementById('reportStartDate');
        const endDate = document.getElementById('reportEndDate');
        const reportType = document.getElementById('reportType');
        
        const selectedClass = classSelect?.value || 'all';
        const fromDate = startDate?.value || '';
        const toDate = endDate?.value || '';
        const type = reportType?.value || 'summary';
        
        // Simulate loading delay
        setTimeout(() => {
            // Generate mock data
            const mockData = generateMockData(selectedClass, fromDate, toDate, type);
            
            // Update stats
            document.getElementById('totalPresentCount').textContent = mockData.totalPresent;
            document.getElementById('totalAbsentCount').textContent = mockData.totalAbsent;
            document.getElementById('attendanceRateValue').textContent = mockData.attendanceRate + '%';
            document.getElementById('totalClassesCount').textContent = mockData.totalClasses;
            
            // Show charts
            reportCharts.style.display = 'grid';
            
            // Render report results
            renderReportResults(mockData, type);
            
            // Show success message
            const reportsAlert = document.getElementById('reportsAlert');
            if (reportsAlert) {
                showAlert(reportsAlert, '<i class="fas fa-check-circle"></i> Report generated successfully!', 'success');
            }
        }, 1000);
    }
    
    // Generate mock data for reports
    function generateMockData(selectedClass, fromDate, toDate, type) {
        // Generate random numbers for demonstration
        const totalPresent = Math.floor(Math.random() * 500) + 500;
        const totalAbsent = Math.floor(Math.random() * 200) + 100;
        const total = totalPresent + totalAbsent;
        const attendanceRate = Math.round((totalPresent / total) * 100);
        const totalClasses = Math.floor(Math.random() * 20) + 10;
        
        return {
            totalPresent,
            totalAbsent,
            total,
            attendanceRate,
            totalClasses,
            selectedClass,
            fromDate,
            toDate,
            type
        };
    }
    
    // Render report results
    function renderReportResults(data, type) {
        const reportResults = document.getElementById('reportResults');
        if (!reportResults) return;
        
        // Clear previous results
        reportResults.innerHTML = '';
        
        // Create report header
        const reportHeader = document.createElement('div');
        reportHeader.className = 'report-header';
        reportHeader.innerHTML = `
            <h3>Attendance Report</h3>
            <div class="report-meta">
                <span><i class="fas fa-calendar-alt"></i> Period: ${data.fromDate || 'All time'} ${data.fromDate && data.toDate ? 'to ' + data.toDate : ''}</span>
                <span><i class="fas fa-chalkboard"></i> Class: ${data.selectedClass === 'all' ? 'All Classes' : data.selectedClass}</span>
                <span><i class="fas fa-chart-pie"></i> Type: ${data.type.charAt(0).toUpperCase() + data.type.slice(1)}</span>
            </div>
        `;
        reportResults.appendChild(reportHeader);
        
        // Create report table
        const reportTable = document.createElement('table');
        reportTable.className = 'report-table';
        
        // Generate table based on report type
        if (type === 'summary') {
            reportTable.innerHTML = `
                <thead>
                    <tr>
                        <th>Class</th>
                        <th>Date</th>
                        <th>Present</th>
                        <th>Absent</th>
                        <th>Rate</th>
                    </tr>
                </thead>
                <tbody>
                    ${generateSummaryRows(10)}
                </tbody>
            `;
        } else if (type === 'detailed') {
            reportTable.innerHTML = `
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Class</th>
                        <th>Student</th>
                        <th>Status</th>
                        <th>Time</th>
                    </tr>
                </thead>
                <tbody>
                    ${generateDetailedRows(15)}
                </tbody>
            `;
        } else if (type === 'student') {
            reportTable.innerHTML = `
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Present</th>
                        <th>Absent</th>
                        <th>Rate</th>
                        <th>Last Attendance</th>
                    </tr>
                </thead>
                <tbody>
                    ${generateStudentRows(12)}
                </tbody>
            `;
        }
        
        reportResults.appendChild(reportTable);
    }
    
    // Generate summary rows
    function generateSummaryRows(count) {
        let rows = '';
        const classes = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English'];
        
        for (let i = 0; i < count; i++) {
            const present = Math.floor(Math.random() * 30) + 10;
            const absent = Math.floor(Math.random() * 10) + 1;
            const total = present + absent;
            const rate = Math.round((present / total) * 100);
            
            const date = new Date();
            date.setDate(date.getDate() - i);
            const formattedDate = date.toLocaleDateString();
            
            rows += `
                <tr>
                    <td>${classes[i % classes.length]}</td>
                    <td>${formattedDate}</td>
                    <td>${present}</td>
                    <td>${absent}</td>
                    <td>${rate}%</td>
                </tr>
            `;
        }
        
        return rows;
    }
    
    // Generate detailed rows
    function generateDetailedRows(count) {
        let rows = '';
        const classes = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English'];
        const students = ['John Smith', 'Emma Johnson', 'Michael Brown', 'Sophia Davis', 'William Wilson'];
        const statuses = ['Present', 'Absent'];
        
        for (let i = 0; i < count; i++) {
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(i / 3));
            const formattedDate = date.toLocaleDateString();
            
            const time = `${Math.floor(Math.random() * 12) + 8}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')} ${Math.random() > 0.5 ? 'AM' : 'PM'}`;
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const statusClass = status === 'Present' ? 'present' : 'absent';
            
            rows += `
                <tr>
                    <td>${formattedDate}</td>
                    <td>${classes[i % classes.length]}</td>
                    <td>${students[i % students.length]}</td>
                    <td><span class="status-badge status-${statusClass.toLowerCase()}">${status}</span></td>
                    <td>${time}</td>
                </tr>
            `;
        }
        
        return rows;
    }
    
    // Generate student rows
    function generateStudentRows(count) {
        let rows = '';
        const students = ['John Smith', 'Emma Johnson', 'Michael Brown', 'Sophia Davis', 'William Wilson', 
                         'Olivia Taylor', 'James Anderson', 'Ava Thomas', 'Robert Jackson', 'Isabella White'];
        
        for (let i = 0; i < count; i++) {
            const present = Math.floor(Math.random() * 30) + 10;
            const absent = Math.floor(Math.random() * 10) + 1;
            const total = present + absent;
            const rate = Math.round((present / total) * 100);
            
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 7));
            const formattedDate = date.toLocaleDateString();
            
            rows += `
                <tr>
                    <td>${students[i % students.length]}</td>
                    <td>${present}</td>
                    <td>${absent}</td>
                    <td>${rate}%</td>
                    <td>${formattedDate}</td>
                </tr>
            `;
        }
        
        return rows;
    }
    
    // Export report
    function exportReport() {
        const format = document.getElementById('reportFormat')?.value || 'none';
        
        if (format === 'none') {
            const reportsAlert = document.getElementById('reportsAlert');
            if (reportsAlert) {
                showAlert(reportsAlert, '<i class="fas fa-exclamation-triangle"></i> Please select an export format', 'error');
            }
            return;
        }
        
        const reportsAlert = document.getElementById('reportsAlert');
        if (reportsAlert) {
            showAlert(reportsAlert, `<i class="fas fa-file-export"></i> Report exported as ${format.toUpperCase()}`, 'success');
        }
    }
    
    // Print report
    function printReport() {
        const reportsAlert = document.getElementById('reportsAlert');
        if (reportsAlert) {
            showAlert(reportsAlert, '<i class="fas fa-print"></i> Preparing report for printing...', 'info');
        }
        
        setTimeout(() => {
            window.print();
        }, 1000);
    }
    
    // Email report
    function emailReport() {
        const reportsAlert = document.getElementById('reportsAlert');
        if (reportsAlert) {
            showAlert(reportsAlert, '<i class="fas fa-envelope"></i> Report has been emailed successfully', 'success');
        }
    }
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .stats-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 25px;
        }
        
        .stats-card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 15px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            border: 1px solid rgba(0, 0, 0, 0.05);
            transition: all 0.3s ease;
        }
        
        .stats-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
        }
        
        .stats-icon {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            flex-shrink: 0;
        }
        
        .stats-card:nth-child(1) .stats-icon {
            background: rgba(102, 187, 106, 0.1);
            color: #66bb6a;
        }
        
        .stats-card:nth-child(2) .stats-icon {
            background: rgba(244, 67, 54, 0.1);
            color: #f44336;
        }
        
        .stats-card:nth-child(3) .stats-icon {
            background: rgba(33, 150, 243, 0.1);
            color: #2196f3;
        }
        
        .stats-card:nth-child(4) .stats-icon {
            background: rgba(156, 39, 176, 0.1);
            color: #9c27b0;
        }
        
        .stats-content {
            display: flex;
            flex-direction: column;
        }
        
        .stats-value {
            font-size: 24px;
            font-weight: 700;
            color: #333;
        }
        
        .stats-label {
            font-size: 14px;
            color: #666;
        }
        
        .export-options {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-top: 20px;
        }
        
        .export-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        
        .report-header {
            margin-bottom: 20px;
        }
        
        .report-header h3 {
            margin: 0 0 10px 0;
            font-size: 20px;
            color: #333;
        }
        
        .report-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            color: #666;
            font-size: 14px;
        }
        
        .report-meta span {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .report-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }
        
        .report-table th {
            background: #f5f5f5;
            padding: 12px 15px;
            text-align: left;
            font-weight: 600;
            color: #333;
            border-bottom: 2px solid #ddd;
        }
        
        .report-table td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
        }
        
        .report-table tr:last-child td {
            border-bottom: none;
        }
        
        .report-table tr:hover td {
            background: #f9f9f9;
        }
        
        .loader-text {
            margin-top: 10px;
            color: #666;
            font-size: 14px;
        }
        
        @media (max-width: 768px) {
            .stats-container {
                grid-template-columns: 1fr;
            }
            
            .export-actions {
                flex-direction: column;
            }
            
            .report-meta {
                flex-direction: column;
                gap: 5px;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Helper function to show alerts
    function showAlert(element, message, type) {
        if (!element) return;
        
        element.innerHTML = message;
        element.className = `alert alert-${type}`;
        element.style.display = 'block';
        
        // Hide alert after 5 seconds
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
});