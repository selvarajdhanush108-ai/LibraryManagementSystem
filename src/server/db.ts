import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_LIBRARY_POLICY, type LibraryPolicyConfig } from '../utils/libraryRules.ts';

const DB_DIR = path.resolve(process.cwd(), 'database');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_FILE = process.env.DATABASE_FILE
  ? path.resolve(process.cwd(), process.env.DATABASE_FILE)
  : path.join(DB_DIR, 'ksr_library.db');

export const db = new DatabaseSync(DB_FILE);

// Enable WAL and Foreign Keys for high concurrency and referential integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  const { hash } = hashPassword(password, storedSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      fullName TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      passwordSalt TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('SuperAdmin', 'Librarian', 'Student', 'Faculty')),
      isActive INTEGER NOT NULL DEFAULT 1,
      failedLoginAttempts INTEGER NOT NULL DEFAULT 0,
      lockoutUntil TEXT,
      lastLoginAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS RefreshTokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      revokedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS PasswordResetTokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      resetCode TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      headOfDepartment TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Programmes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      degreeLevel TEXT NOT NULL CHECK (degreeLevel IN ('UG', 'PG', 'PhD')),
      departmentId INTEGER NOT NULL,
      durationYears INTEGER NOT NULL DEFAULT 4,
      isArchived INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (departmentId) REFERENCES Departments(id)
    );

    CREATE TABLE IF NOT EXISTS Members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER UNIQUE,
      memberCode TEXT NOT NULL UNIQUE,
      registrationNumber TEXT NOT NULL UNIQUE,
      fullName TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      memberType TEXT NOT NULL CHECK (memberType IN ('Student', 'Faculty')),
      departmentId INTEGER NOT NULL,
      programmeId INTEGER,
      yearOfStudy INTEGER,
      accountStatus TEXT NOT NULL DEFAULT 'Active' CHECK (accountStatus IN ('Active', 'Inactive', 'Suspended')),
      membershipStartDate TEXT NOT NULL,
      membershipEndDate TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES Users(id),
      FOREIGN KEY (departmentId) REFERENCES Departments(id),
      FOREIGN KEY (programmeId) REFERENCES Programmes(id)
    );

    CREATE TABLE IF NOT EXISTS Authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullName TEXT NOT NULL UNIQUE,
      biography TEXT,
      country TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Publishers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      city TEXT,
      website TEXT,
      contactEmail TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      deweyPrefix TEXT,
      description TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookCode TEXT NOT NULL UNIQUE,
      isbn TEXT UNIQUE,
      title TEXT NOT NULL,
      subtitle TEXT,
      publisherId INTEGER NOT NULL,
      edition TEXT,
      publicationYear INTEGER NOT NULL,
      categoryId INTEGER NOT NULL,
      language TEXT NOT NULL DEFAULT 'English',
      description TEXT,
      shelfLocation TEXT NOT NULL,
      coverUrl TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (publisherId) REFERENCES Publishers(id),
      FOREIGN KEY (categoryId) REFERENCES Categories(id)
    );

    CREATE TABLE IF NOT EXISTS BookAuthors (
      bookId INTEGER NOT NULL,
      authorId INTEGER NOT NULL,
      authorOrder INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (bookId, authorId),
      FOREIGN KEY (bookId) REFERENCES Books(id) ON DELETE CASCADE,
      FOREIGN KEY (authorId) REFERENCES Authors(id)
    );

    CREATE TABLE IF NOT EXISTS PhysicalBookCopies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookId INTEGER NOT NULL,
      accessionNumber TEXT NOT NULL UNIQUE,
      barcode TEXT NOT NULL UNIQUE,
      acquisitionDate TEXT NOT NULL,
      acquisitionPrice REAL NOT NULL DEFAULT 0,
      shelfLocation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Issued', 'Reserved', 'Lost', 'Damaged', 'UnderMaintenance')),
      conditionNotes TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (bookId) REFERENCES Books(id)
    );

    CREATE TABLE IF NOT EXISTS Loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loanNumber TEXT NOT NULL UNIQUE,
      memberId INTEGER NOT NULL,
      copyId INTEGER NOT NULL,
      bookId INTEGER NOT NULL,
      issuedAt TEXT NOT NULL,
      dueDate TEXT NOT NULL,
      returnedAt TEXT,
      renewalCount INTEGER NOT NULL DEFAULT 0,
      issuedByUserId INTEGER NOT NULL,
      returnedByUserId INTEGER,
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Returned', 'Overdue')),
      remarks TEXT,
      FOREIGN KEY (memberId) REFERENCES Members(id),
      FOREIGN KEY (copyId) REFERENCES PhysicalBookCopies(id),
      FOREIGN KEY (bookId) REFERENCES Books(id),
      FOREIGN KEY (issuedByUserId) REFERENCES Users(id),
      FOREIGN KEY (returnedByUserId) REFERENCES Users(id)
    );

    CREATE TABLE IF NOT EXISTS Reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservationNumber TEXT NOT NULL UNIQUE,
      bookId INTEGER NOT NULL,
      memberId INTEGER NOT NULL,
      allocatedCopyId INTEGER,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'ReadyForPickup', 'Approved', 'Fulfilled', 'Cancelled', 'Expired', 'Rejected')),
      createdAt TEXT NOT NULL,
      expiresAt TEXT,
      approvedByUserId INTEGER,
      notes TEXT,
      FOREIGN KEY (bookId) REFERENCES Books(id),
      FOREIGN KEY (memberId) REFERENCES Members(id),
      FOREIGN KEY (allocatedCopyId) REFERENCES PhysicalBookCopies(id),
      FOREIGN KEY (approvedByUserId) REFERENCES Users(id)
    );

    CREATE TABLE IF NOT EXISTS FineAssessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loanId INTEGER NOT NULL UNIQUE,
      memberId INTEGER NOT NULL,
      overdueDays INTEGER NOT NULL,
      assessedAmount REAL NOT NULL,
      paidAmount REAL NOT NULL DEFAULT 0,
      waivedAmount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'PartiallyPaid', 'Paid', 'Waived')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loanId) REFERENCES Loans(id),
      FOREIGN KEY (memberId) REFERENCES Members(id)
    );

    CREATE TABLE IF NOT EXISTS FinePayments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fineAssessmentId INTEGER NOT NULL,
      memberId INTEGER NOT NULL,
      amount REAL NOT NULL,
      paymentMethod TEXT NOT NULL DEFAULT 'Cash Counter',
      receiptNumber TEXT NOT NULL UNIQUE,
      recordedByUserId INTEGER NOT NULL,
      paidAt TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT,
      FOREIGN KEY (fineAssessmentId) REFERENCES FineAssessments(id),
      FOREIGN KEY (memberId) REFERENCES Members(id),
      FOREIGN KEY (recordedByUserId) REFERENCES Users(id)
    );

    CREATE TABLE IF NOT EXISTS FineWaivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fineAssessmentId INTEGER NOT NULL,
      memberId INTEGER NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      authorizedByUserId INTEGER NOT NULL,
      waivedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (fineAssessmentId) REFERENCES FineAssessments(id),
      FOREIGN KEY (memberId) REFERENCES Members(id),
      FOREIGN KEY (authorizedByUserId) REFERENCES Users(id)
    );

    CREATE TABLE IF NOT EXISTS Notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      memberId INTEGER,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      notificationType TEXT NOT NULL CHECK (notificationType IN ('Issue', 'DueReminder', 'Overdue', 'Return', 'ReservationAvailable', 'ReservationExpired', 'Renewal', 'FinePayment', 'System')),
      isRead INTEGER NOT NULL DEFAULT 0,
      relatedEntityType TEXT,
      relatedEntityId INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES Users(id),
      FOREIGN KEY (memberId) REFERENCES Members(id)
    );

    CREATE TABLE IF NOT EXISTS LibraryPolicies (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      studentLoanDays INTEGER NOT NULL DEFAULT 14,
      facultyLoanDays INTEGER NOT NULL DEFAULT 28,
      studentLoanLimit INTEGER NOT NULL DEFAULT 3,
      facultyLoanLimit INTEGER NOT NULL DEFAULT 5,
      finePerDay REAL NOT NULL DEFAULT 2.0,
      maxRenewals INTEGER NOT NULL DEFAULT 2,
      renewalExtensionDays INTEGER NOT NULL DEFAULT 14,
      allowOverdueRenewal INTEGER NOT NULL DEFAULT 0,
      blockIssueOnOverdue INTEGER NOT NULL DEFAULT 1,
      maxUnpaidFineLimit REAL NOT NULL DEFAULT 100.0,
      reservationExpiryHours INTEGER NOT NULL DEFAULT 48,
      excludeSundaysInFine INTEGER NOT NULL DEFAULT 0,
      updatedByUserId INTEGER,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS AuditLogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actorUserId INTEGER,
      actorName TEXT NOT NULL,
      actorRole TEXT NOT NULL,
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT,
      details TEXT,
      ipAddress TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_books_title ON Books(title);
    CREATE INDEX IF NOT EXISTS idx_books_category ON Books(categoryId);
    CREATE INDEX IF NOT EXISTS idx_copies_book ON PhysicalBookCopies(bookId);
    CREATE INDEX IF NOT EXISTS idx_copies_status ON PhysicalBookCopies(status);
    CREATE INDEX IF NOT EXISTS idx_loans_member ON Loans(memberId);
    CREATE INDEX IF NOT EXISTS idx_loans_status ON Loans(status);
    CREATE INDEX IF NOT EXISTS idx_loans_duedate ON Loans(dueDate);
    CREATE INDEX IF NOT EXISTS idx_reservations_book ON Reservations(bookId);
    CREATE INDEX IF NOT EXISTS idx_fines_member ON FineAssessments(memberId);
  `);

  seedDemonstrationDataIfEmpty();
}

export function getLibraryPolicy(): LibraryPolicyConfig {
  const row = db.prepare('SELECT * FROM LibraryPolicies WHERE id = 1').get() as Record<string, unknown> | undefined;
  if (!row) return DEFAULT_LIBRARY_POLICY;
  return {
    studentLoanDays: Number(row.studentLoanDays),
    facultyLoanDays: Number(row.facultyLoanDays),
    studentLoanLimit: Number(row.studentLoanLimit),
    facultyLoanLimit: Number(row.facultyLoanLimit),
    finePerDay: Number(row.finePerDay),
    maxRenewals: Number(row.maxRenewals),
    renewalExtensionDays: Number(row.renewalExtensionDays),
    allowOverdueRenewal: Boolean(row.allowOverdueRenewal),
    blockIssueOnOverdue: Boolean(row.blockIssueOnOverdue),
    maxUnpaidFineLimit: Number(row.maxUnpaidFineLimit),
    reservationExpiryHours: Number(row.reservationExpiryHours),
    excludeSundaysInFine: Boolean(row.excludeSundaysInFine),
  };
}

export function logAudit(params: {
  actorUserId?: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: string;
  ipAddress?: string;
}): void {
  db.prepare(`
    INSERT INTO AuditLogs (actorUserId, actorName, actorRole, action, entityType, entityId, details, ipAddress, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.actorUserId ?? null,
    params.actorName,
    params.actorRole,
    params.action,
    params.entityType,
    params.entityId != null ? String(params.entityId) : null,
    params.details ?? null,
    params.ipAddress ?? '127.0.0.1',
    new Date().toISOString()
  );
}

function seedDemonstrationDataIfEmpty(): void {
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM Users').get() as { cnt: number }).cnt;
  if (userCount > 0) return;

  db.exec('BEGIN TRANSACTION');
  try {
    // 1. Roles
    const insertRole = db.prepare('INSERT INTO Roles (name, description) VALUES (?, ?)');
    insertRole.run('SuperAdmin', 'System-wide administrative control, policy management, and staff provisioning');
    insertRole.run('Librarian', 'Circulation desk operations, catalog & physical inventory management, fine collection');
    insertRole.run('Student', 'Student self-service portal access for catalog search, renewals, and reservations');
    insertRole.run('Faculty', 'Faculty portal access with extended borrowing limits and loan durations');

    // 2. Policy
    db.prepare(`
      INSERT INTO LibraryPolicies (
        id, studentLoanDays, facultyLoanDays, studentLoanLimit, facultyLoanLimit,
        finePerDay, maxRenewals, renewalExtensionDays, allowOverdueRenewal,
        blockIssueOnOverdue, maxUnpaidFineLimit, reservationExpiryHours, excludeSundaysInFine
      ) VALUES (1, 14, 28, 3, 5, 2.0, 2, 14, 0, 1, 100.0, 48, 0)
    `).run();

    // 3. Users (Synthetic Demo Accounts)
    const insertUser = db.prepare(`
      INSERT INTO Users (email, fullName, passwordHash, passwordSalt, role, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);

    const nowIso = new Date().toISOString();
    const adminPwd = hashPassword('KsrAdmin@2026');
    const libPwd = hashPassword('KsrLibrary@2026');
    const stuPwd = hashPassword('KsrStudent@2026');
    const facPwd = hashPassword('KsrFaculty@2026');

    const adminRes = insertUser.run('admin@ksrce.ac.in', 'Dr. R. Karthikeyan (Chief Library Administrator)', adminPwd.hash, adminPwd.salt, 'SuperAdmin', nowIso);
    const libRes = insertUser.run('librarian@ksrce.ac.in', 'S. Meenakshi Sundaram (Senior Librarian)', libPwd.hash, libPwd.salt, 'Librarian', nowIso);
    const lib2Res = insertUser.run('circulation@ksrce.ac.in', 'M. Senthilkumar (Assistant Librarian)', libPwd.hash, libPwd.salt, 'Librarian', nowIso);

    const stu1User = insertUser.run('student.cs01@ksrce.ac.in', 'Aravind Kumar S.', stuPwd.hash, stuPwd.salt, 'Student', nowIso);
    const stu2User = insertUser.run('student.ec02@ksrce.ac.in', 'Divya Dharshini M.', stuPwd.hash, stuPwd.salt, 'Student', nowIso);
    const stu3User = insertUser.run('student.me03@ksrce.ac.in', 'Pradeep Raj K.', stuPwd.hash, stuPwd.salt, 'Student', nowIso);
    const stu4User = insertUser.run('student.ee04@ksrce.ac.in', 'Keerthana V.', stuPwd.hash, stuPwd.salt, 'Student', nowIso);
    const stu5User = insertUser.run('student.ai05@ksrce.ac.in', 'Hariharan N.', stuPwd.hash, stuPwd.salt, 'Student', nowIso);

    const fac1User = insertUser.run('faculty.cse@ksrce.ac.in', 'Dr. P. Balasubramani', facPwd.hash, facPwd.salt, 'Faculty', nowIso);
    const fac2User = insertUser.run('faculty.ece@ksrce.ac.in', 'Prof. V. Vijayalakshmi', facPwd.hash, facPwd.salt, 'Faculty', nowIso);

    const adminUserId = Number(adminRes.lastInsertRowid);
    const libUserId = Number(libRes.lastInsertRowid);
    void lib2Res;

    // 4. Departments (Synthetic Demo Academic Structure at KSRCE)
    const insertDept = db.prepare('INSERT INTO Departments (code, name, headOfDepartment) VALUES (?, ?, ?)');
    const dCse = Number(insertDept.run('CSE', 'Computer Science and Engineering', 'Dr. A. Rajiv Kannan').lastInsertRowid);
    const dEce = Number(insertDept.run('ECE', 'Electronics and Communication Engineering', 'Dr. P. Senthil Kumar').lastInsertRowid);
    const dEee = Number(insertDept.run('EEE', 'Electrical and Electronics Engineering', 'Dr. R. Murugan').lastInsertRowid);
    const dMech = Number(insertDept.run('MECH', 'Mechanical Engineering', 'Dr. K. Ramesh').lastInsertRowid);
    const dCivil = Number(insertDept.run('CIVIL', 'Civil Engineering', 'Dr. N.Gunasekaran').lastInsertRowid);
    const dAi = Number(insertDept.run('AIDS', 'Artificial Intelligence and Data Science', 'Dr. S. Gomathi').lastInsertRowid);
    const dMba = Number(insertDept.run('MBA', 'Master of Business Administration', 'Dr. M. Loganathan').lastInsertRowid);

    // 5. Programmes
    const insertProg = db.prepare('INSERT INTO Programmes (code, name, degreeLevel, departmentId, durationYears) VALUES (?, ?, ?, ?, ?)');
    const pCse = Number(insertProg.run('BE-CSE', 'B.E. Computer Science and Engineering', 'UG', dCse, 4).lastInsertRowid);
    const pEce = Number(insertProg.run('BE-ECE', 'B.E. Electronics and Communication Engineering', 'UG', dEce, 4).lastInsertRowid);
    const pEee = Number(insertProg.run('BE-EEE', 'B.E. Electrical and Electronics Engineering', 'UG', dEee, 4).lastInsertRowid);
    const pMech = Number(insertProg.run('BE-MECH', 'B.E. Mechanical Engineering', 'UG', dMech, 4).lastInsertRowid);
    const pCivil = Number(insertProg.run('BE-CIVIL', 'B.E. Civil Engineering', 'UG', dCivil, 4).lastInsertRowid);
    const pAi = Number(insertProg.run('BTECH-AIDS', 'B.Tech. Artificial Intelligence and Data Science', 'UG', dAi, 4).lastInsertRowid);
    insertProg.run('MBA-GEN', 'Master of Business Administration', 'PG', dMba, 2);

    // 6. Members
    const insertMember = db.prepare(`
      INSERT INTO Members (
        userId, memberCode, registrationNumber, fullName, email, phone,
        memberType, departmentId, programmeId, yearOfStudy, accountStatus,
        membershipStartDate, membershipEndDate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const mStu1 = Number(insertMember.run(
      Number(stu1User.lastInsertRowid), 'KSR-MEM-2026-001', '73152313001',
      'Aravind Kumar S.', 'student.cs01@ksrce.ac.in', '+91 94432 10111',
      'Student', dCse, pCse, 3, 'Active', '2024-08-01', '2028-05-31'
    ).lastInsertRowid);

    const mStu2 = Number(insertMember.run(
      Number(stu2User.lastInsertRowid), 'KSR-MEM-2026-002', '73152314018',
      'Divya Dharshini M.', 'student.ec02@ksrce.ac.in', '+91 94432 10222',
      'Student', dEce, pEce, 3, 'Active', '2024-08-01', '2028-05-31'
    ).lastInsertRowid);

    const mStu3 = Number(insertMember.run(
      Number(stu3User.lastInsertRowid), 'KSR-MEM-2026-003', '73152216045',
      'Pradeep Raj K.', 'student.me03@ksrce.ac.in', '+91 94432 10333',
      'Student', dMech, pMech, 4, 'Active', '2023-08-01', '2027-05-31'
    ).lastInsertRowid);

    const mStu4 = Number(insertMember.run(
      Number(stu4User.lastInsertRowid), 'KSR-MEM-2026-004', '73152415012',
      'Keerthana V.', 'student.ee04@ksrce.ac.in', '+91 94432 10444',
      'Student', dEee, pEee, 2, 'Active', '2025-08-01', '2029-05-31'
    ).lastInsertRowid);

    const mStu5 = Number(insertMember.run(
      Number(stu5User.lastInsertRowid), 'KSR-MEM-2026-005', '73152424009',
      'Hariharan N.', 'student.ai05@ksrce.ac.in', '+91 94432 10555',
      'Student', dAi, pAi, 2, 'Active', '2025-08-01', '2029-05-31'
    ).lastInsertRowid);

    const mFac1 = Number(insertMember.run(
      Number(fac1User.lastInsertRowid), 'KSR-FAC-2020-101', 'KSRCE-FAC-CSE-08',
      'Dr. P. Balasubramani', 'faculty.cse@ksrce.ac.in', '+91 98427 22011',
      'Faculty', dCse, null, null, 'Active', '2020-06-15', null
    ).lastInsertRowid);

    const mFac2 = Number(insertMember.run(
      Number(fac2User.lastInsertRowid), 'KSR-FAC-2021-104', 'KSRCE-FAC-ECE-14',
      'Prof. V. Vijayalakshmi', 'faculty.ece@ksrce.ac.in', '+91 98427 22022',
      'Faculty', dEce, null, null, 'Active', '2021-07-01', null
    ).lastInsertRowid);

    void pCivil;

    // 7. Publishers
    const insertPub = db.prepare('INSERT INTO Publishers (name, city, website, contactEmail) VALUES (?, ?, ?, ?)');
    const pubMit = Number(insertPub.run('MIT Press / PHI Learning', 'New Delhi', 'https://www.phindia.com', 'editorial@phindia.com').lastInsertRowid);
    const pubPearson = Number(insertPub.run('Pearson Education India', 'Chennai', 'https://in.pearson.com', 'academics.in@pearson.com').lastInsertRowid);
    const pubMcGraw = Number(insertPub.run('McGraw Hill Education India', 'Noida', 'https://www.mheducation.co.in', 'support.india@mheducation.com').lastInsertRowid);
    const pubOxford = Number(insertPub.run('Oxford University Press India', 'New Delhi', 'https://india.oup.com', 'higher.ed.in@oup.com').lastInsertRowid);
    const pubKhanna = Number(insertPub.run('Khanna Publishers', 'New Delhi', 'https://www.khannapublishers.in', 'info@khannapublishers.in').lastInsertRowid);
    const pubLaxmi = Number(insertPub.run('Laxmi Publications', 'New Delhi', 'https://www.laxmipublications.com', 'info@laxmipublications.com').lastInsertRowid);

    // 8. Categories
    const insertCat = db.prepare('INSERT INTO Categories (code, name, deweyPrefix, description) VALUES (?, ?, ?, ?)');
    const catCs = Number(insertCat.run('CAT-CS', 'Computer Science & Algorithms', '004-006', 'Algorithms, Data Structures, Operating Systems, Databases, and Artificial Intelligence').lastInsertRowid);
    const catEc = Number(insertCat.run('CAT-EC', 'Electronics & VLSI Systems', '621.38', 'Microelectronic Circuits, Digital Design, Signals & Systems, Embedded Systems').lastInsertRowid);
    const catEe = Number(insertCat.run('CAT-EE', 'Electrical Machines & Power Systems', '621.31', 'Power Electronics, Electrical Machinery, Control Systems, High Voltage Engineering').lastInsertRowid);
    const catMe = Number(insertCat.run('CAT-ME', 'Mechanical & Thermal Engineering', '621.40', 'Engineering Thermodynamics, Fluid Mechanics, Heat & Mass Transfer, CAD/CAM').lastInsertRowid);
    const catCe = Number(insertCat.run('CAT-CE', 'Civil & Structural Engineering', '624.10', 'Surveying, Strength of Materials, Reinforced Concrete Design, Geotechnical Engineering').lastInsertRowid);
    const catMa = Number(insertCat.run('CAT-MA', 'Engineering Mathematics & Sciences', '510.24', 'Higher Engineering Mathematics, Probability & Queueing Theory, Numerical Methods').lastInsertRowid);

    // 9. Authors
    const insertAuthor = db.prepare('INSERT INTO Authors (fullName, biography, country) VALUES (?, ?, ?)');
    const auCormen = Number(insertAuthor.run('Thomas H. Cormen', 'Emeritus Professor of Computer Science at Dartmouth College', 'USA').lastInsertRowid);
    const auLeiserson = Number(insertAuthor.run('Charles E. Leiserson', 'Professor of Computer Science and Engineering at MIT', 'USA').lastInsertRowid);
    const auMano = Number(insertAuthor.run('M. Morris Mano', 'Emeritus Professor of Computer Engineering, California State University', 'USA').lastInsertRowid);
    const auSedra = Number(insertAuthor.run('Adel S. Sedra', 'Distinguished Professor Emeritus of Electrical and Computer Engineering', 'Canada').lastInsertRowid);
    const auNag = Number(insertAuthor.run('P. K. Nag', 'Former Professor of Mechanical Engineering, IIT Kharagpur', 'India').lastInsertRowid);
    const auGrewal = Number(insertAuthor.run('Dr. B. S. Grewal', 'Author of Higher Engineering Mathematics across Indian technical universities', 'India').lastInsertRowid);
    const auBala = Number(insertAuthor.run('E. Balagurusamy', 'Former Vice Chancellor, Anna University, Chennai', 'India').lastInsertRowid);
    const auPunmia = Number(insertAuthor.run('Dr. B. C. Punmia', 'Former Professor & Head of Civil Engineering, MBM Engineering College', 'India').lastInsertRowid);
    const auNagrath = Number(insertAuthor.run('I. J. Nagrath', 'Professor Emeritus, Birla Institute of Technology & Science, Pilani', 'India').lastInsertRowid);
    const auSilberschatz = Number(insertAuthor.run('Abraham Silberschatz', 'Sidney J. Weinberg Professor of Computer Science at Yale University', 'USA').lastInsertRowid);

    // 10. Books & BookAuthors
    const insertBook = db.prepare(`
      INSERT INTO Books (
        bookCode, isbn, title, subtitle, publisherId, edition, publicationYear,
        categoryId, language, description, shelfLocation, coverUrl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'English', ?, ?, null)
    `);
    const insertBookAuthor = db.prepare('INSERT INTO BookAuthors (bookId, authorId, authorOrder) VALUES (?, ?, ?)');

    const b1 = Number(insertBook.run(
      'KSR-BK-0001', '9780262046305',
      'Introduction to Algorithms', 'Fourth Edition — CLRS Reference Edition',
      pubMit, '4th Edition', 2022, catCs,
      'Comprehensive textbook covering design and analysis of algorithms, graph theory, dynamic programming, and NP-completeness.',
      'Rack A-01 / Shelf 2'
    ).lastInsertRowid);
    insertBookAuthor.run(b1, auCormen, 1);
    insertBookAuthor.run(b1, auLeiserson, 2);

    const b2 = Number(insertBook.run(
      'KSR-BK-0002', '9789352866588',
      'Digital Design: With an Introduction to the Verilog HDL, VHDL, and SystemVerilog', 'Sixth Edition',
      pubPearson, '6th Edition', 2021, catEc,
      'Foundational Anna University curriculum text for combinational logic, synchronous sequential circuits, and HDL synthesis.',
      'Rack B-03 / Shelf 1'
    ).lastInsertRowid);
    insertBookAuthor.run(b2, auMano, 1);

    const b3 = Number(insertBook.run(
      'KSR-BK-0003', '9780190853464',
      'Microelectronic Circuits', 'Theory and Applications — International Eighth Edition',
      pubOxford, '8th Edition', 2020, catEc,
      'Industry-standard reference on operational amplifiers, MOSFETs, BJTs, differential amplifiers, and integrated circuit design.',
      'Rack B-04 / Shelf 3'
    ).lastInsertRowid);
    insertBookAuthor.run(b3, auSedra, 1);

    const b4 = Number(insertBook.run(
      'KSR-BK-0004', '9789352606429',
      'Engineering Thermodynamics', 'Sixth Edition — SI Units',
      pubMcGraw, '6th Edition', 2021, catMe,
      'Complete treatment of First and Second Laws of Thermodynamics, entropy, availability, steam tables, and gas power cycles.',
      'Rack D-02 / Shelf 1'
    ).lastInsertRowid);
    insertBookAuthor.run(b4, auNag, 1);

    const b5 = Number(insertBook.run(
      'KSR-BK-0005', '9788193328491',
      'Higher Engineering Mathematics', 'Forty-Fourth Edition',
      pubKhanna, '44th Edition', 2023, catMa,
      'Covers differential calculus, Laplace transforms, Fourier series, complex analysis, vector calculus, and numerical methods.',
      'Rack F-01 / Shelf 1'
    ).lastInsertRowid);
    insertBookAuthor.run(b5, auGrewal, 1);

    const b6 = Number(insertBook.run(
      'KSR-BK-0006', '9789353165123',
      'Object-Oriented Programming with C++', 'Eighth Edition',
      pubMcGraw, '8th Edition', 2021, catCs,
      'Accessible curriculum text for classes, inheritance, polymorphism, operator overloading, templates, and STL.',
      'Rack A-02 / Shelf 4'
    ).lastInsertRowid);
    insertBookAuthor.run(b6, auBala, 1);

    const b7 = Number(insertBook.run(
      'KSR-BK-0007', '9788131808047',
      'Surveying — Volume I', 'Seventeenth Edition',
      pubLaxmi, '17th Edition', 2022, catCe,
      'Detailed coverage of chain surveying, compass traversing, levelling, plane table surveying, and theodolite operations.',
      'Rack E-01 / Shelf 2'
    ).lastInsertRowid);
    insertBookAuthor.run(b7, auPunmia, 1);

    const b8 = Number(insertBook.run(
      'KSR-BK-0008', '9789339221119',
      'Electric Machines', 'Fifth Edition',
      pubMcGraw, '5th Edition', 2020, catEe,
      'Analysis of transformers, DC machines, induction motors, and synchronous generators with Indian power grid examples.',
      'Rack C-01 / Shelf 3'
    ).lastInsertRowid);
    insertBookAuthor.run(b8, auNagrath, 1);

    const b9 = Number(insertBook.run(
      'KSR-BK-0009', '9780078022159',
      'Database System Concepts', 'Seventh Edition',
      pubMcGraw, '7th Edition', 2021, catCs,
      'Relational model, SQL, normalization, indexing, query optimization, transaction ACID guarantees, and distributed databases.',
      'Rack A-04 / Shelf 2'
    ).lastInsertRowid);
    insertBookAuthor.run(b9, auSilberschatz, 1);

    // 11. PhysicalBookCopies
    const insertCopy = db.prepare(`
      INSERT INTO PhysicalBookCopies (
        bookId, accessionNumber, barcode, acquisitionDate, acquisitionPrice, shelfLocation, status, conditionNotes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const c1 = Number(insertCopy.run(b1, 'KSR-ACC-1001', 'BC-KSR-1001', '2024-06-10', 1250.0, 'Rack A-01 / Shelf 2', 'Issued', 'Good condition').lastInsertRowid);
    const c2 = Number(insertCopy.run(b1, 'KSR-ACC-1002', 'BC-KSR-1002', '2024-06-10', 1250.0, 'Rack A-01 / Shelf 2', 'Available', 'New hardcover').lastInsertRowid);
    const c3 = Number(insertCopy.run(b1, 'KSR-ACC-1003', 'BC-KSR-1003', '2024-06-10', 1250.0, 'Rack A-01 / Shelf 2', 'Available', 'Good condition').lastInsertRowid);

    const c4 = Number(insertCopy.run(b2, 'KSR-ACC-1004', 'BC-KSR-1004', '2024-07-12', 780.0, 'Rack B-03 / Shelf 1', 'Issued', 'Good condition').lastInsertRowid);
    const c5 = Number(insertCopy.run(b2, 'KSR-ACC-1005', 'BC-KSR-1005', '2024-07-12', 780.0, 'Rack B-03 / Shelf 1', 'Available', 'Good condition').lastInsertRowid);

    const c6 = Number(insertCopy.run(b3, 'KSR-ACC-1006', 'BC-KSR-1006', '2024-07-15', 950.0, 'Rack B-04 / Shelf 3', 'Issued', 'Reference spine label').lastInsertRowid); // Only copy of b3 -> Issued so b3 can be reserved!

    const c7 = Number(insertCopy.run(b4, 'KSR-ACC-1007', 'BC-KSR-1007', '2024-08-01', 690.0, 'Rack D-02 / Shelf 1', 'Issued', 'Good condition').lastInsertRowid);
    const c8 = Number(insertCopy.run(b4, 'KSR-ACC-1008', 'BC-KSR-1008', '2024-08-01', 690.0, 'Rack D-02 / Shelf 1', 'Available', 'Good condition').lastInsertRowid);
    const c9 = Number(insertCopy.run(b4, 'KSR-ACC-1009', 'BC-KSR-1009', '2024-08-01', 690.0, 'Rack D-02 / Shelf 1', 'Damaged', 'Binding loose on pages 120-140; sent to bindery').lastInsertRowid);

    const c10 = Number(insertCopy.run(b5, 'KSR-ACC-1010', 'BC-KSR-1010', '2024-08-10', 895.0, 'Rack F-01 / Shelf 1', 'Available', 'Good condition').lastInsertRowid);
    const c11 = Number(insertCopy.run(b5, 'KSR-ACC-1011', 'BC-KSR-1011', '2024-08-10', 895.0, 'Rack F-01 / Shelf 1', 'Available', 'Good condition').lastInsertRowid);
    const c12 = Number(insertCopy.run(b5, 'KSR-ACC-1012', 'BC-KSR-1012', '2024-08-10', 895.0, 'Rack F-01 / Shelf 1', 'UnderMaintenance', 'Re-laminating jacket').lastInsertRowid);

    const c13 = Number(insertCopy.run(b6, 'KSR-ACC-1013', 'BC-KSR-1013', '2024-09-01', 625.0, 'Rack A-02 / Shelf 4', 'Available', 'Good condition').lastInsertRowid);
    const c14 = Number(insertCopy.run(b6, 'KSR-ACC-1014', 'BC-KSR-1014', '2024-09-01', 625.0, 'Rack A-02 / Shelf 4', 'Lost', 'Reported lost during odd semester exam week').lastInsertRowid);

    const c15 = Number(insertCopy.run(b7, 'KSR-ACC-1015', 'BC-KSR-1015', '2024-09-12', 740.0, 'Rack E-01 / Shelf 2', 'Available', 'Good condition').lastInsertRowid);
    const c16 = Number(insertCopy.run(b8, 'KSR-ACC-1016', 'BC-KSR-1016', '2024-09-20', 810.0, 'Rack C-01 / Shelf 3', 'Available', 'Good condition').lastInsertRowid);
    const c17 = Number(insertCopy.run(b9, 'KSR-ACC-1017', 'BC-KSR-1017', '2024-10-01', 1120.0, 'Rack A-04 / Shelf 2', 'Available', 'New edition').lastInsertRowid);
    const c18 = Number(insertCopy.run(b9, 'KSR-ACC-1018', 'BC-KSR-1018', '2024-10-01', 1120.0, 'Rack A-04 / Shelf 2', 'Available', 'New edition').lastInsertRowid);

    void c2; void c3; void c5; void c8; void c9; void c11; void c12; void c14; void c15; void c16; void c17; void c18;

    // 12. Sample Loans (Relative to current clock so overdue & upcoming due dates are always realistic)
    const today = new Date();
    const dayStr = (offsetDays: number) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + offsetDays);
      return d.toISOString().split('T')[0];
    };
    const isoStr = (offsetDays: number) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + offsetDays);
      return d.toISOString();
    };

    const insertLoan = db.prepare(`
      INSERT INTO Loans (
        loanNumber, memberId, copyId, bookId, issuedAt, dueDate, returnedAt,
        renewalCount, issuedByUserId, returnedByUserId, status, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Active Loan 1: Student 1 (Aravind) borrowed Introduction to Algorithms (c1), due in 5 days
    insertLoan.run(
      'KSR-LN-2026-001', mStu1, c1, b1,
      isoStr(-9), dayStr(5), null, 0, libUserId, null, 'Active',
      'Issued at Central Library Counter 1'
    );

    // Active Loan 2: Student 2 (Divya) borrowed Digital Design (c4), OVERDUE by 6 days
    const overdueLoan1 = Number(insertLoan.run(
      'KSR-LN-2026-002', mStu2, c4, b2,
      isoStr(-20), dayStr(-6), null, 1, libUserId, null, 'Overdue',
      'Overdue notice sent via portal'
    ).lastInsertRowid);

    // Active Loan 3: Faculty 1 (Dr. Balasubramani) borrowed Microelectronic Circuits (c6), due in 18 days
    insertLoan.run(
      'KSR-LN-2026-003', mFac1, c6, b3,
      isoStr(-10), dayStr(18), null, 0, libUserId, null, 'Active',
      'Faculty semester reference loan'
    );

    // Active Loan 4: Student 3 (Pradeep) borrowed Engineering Thermodynamics (c7), OVERDUE by 9 days
    const overdueLoan2 = Number(insertLoan.run(
      'KSR-LN-2026-004', mStu3, c7, b4,
      isoStr(-23), dayStr(-9), null, 0, libUserId, null, 'Overdue',
      'Overdue loan'
    ).lastInsertRowid);

    // Historical Returned Loan 5: Student 1 returned Higher Engineering Mathematics (c10) 12 days ago (was 8 days overdue -> ₹16 fine, partially paid ₹10)
    const returnedLoan1 = Number(insertLoan.run(
      'KSR-LN-2026-005', mStu1, c10, b5,
      isoStr(-34), dayStr(-20), isoStr(-12), 0, libUserId, libUserId, 'Returned',
      'Returned 8 days past due date'
    ).lastInsertRowid);

    // Historical Returned Loan 6: Student 4 returned OOP with C++ (c13) 5 days ago (was 5 days overdue -> ₹10 fine, fully paid)
    const returnedLoan2 = Number(insertLoan.run(
      'KSR-LN-2026-006', mStu4, c13, b6,
      isoStr(-24), dayStr(-10), isoStr(-5), 1, libUserId, libUserId, 'Returned',
      'Returned and fine settled at counter'
    ).lastInsertRowid);

    // Historical Returned Loan 7: Faculty 2 returned Database System Concepts (c17) on time last month
    insertLoan.run(
      'KSR-LN-2026-007', mFac2, c17, b9,
      isoStr(-40), dayStr(-15), isoStr(-18), 0, libUserId, libUserId, 'Returned',
      'Returned in good condition'
    );

    // 13. Reservations (Waiting List on Microelectronic Circuits b3 since its only copy c6 is issued)
    const insertReservation = db.prepare(`
      INSERT INTO Reservations (
        reservationNumber, bookId, memberId, allocatedCopyId, status, createdAt, expiresAt, approvedByUserId, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertReservation.run(
      'KSR-RES-2026-001', b3, mStu2, null, 'Pending',
      isoStr(-3), dayStr(4), null,
      'Requested for VLSI Design Lab preparation (Queue #1)'
    );
    insertReservation.run(
      'KSR-RES-2026-002', b3, mStu5, null, 'Pending',
      isoStr(-1), dayStr(6), null,
      'Requested for Analog IC assignment (Queue #2)'
    );

    // 14. FineAssessments & FinePayments
    const insertFine = db.prepare(`
      INSERT INTO FineAssessments (
        loanId, memberId, overdueDays, assessedAmount, paidAmount, waivedAmount, status, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Fine 1: Student 1 (Aravind) — ₹16 assessed, ₹6 paid, ₹10 remaining (PartiallyPaid)
    const fine1Id = Number(insertFine.run(
      returnedLoan1, mStu1, 8, 16.0, 6.0, 0.0, 'PartiallyPaid', isoStr(-12)
    ).lastInsertRowid);

    // Fine 2: Student 4 (Keerthana) — ₹10 assessed, ₹10 paid (Paid)
    const fine2Id = Number(insertFine.run(
      returnedLoan2, mStu4, 5, 10.0, 10.0, 0.0, 'Paid', isoStr(-5)
    ).lastInsertRowid);

    // Fine 3: Student 2 (Divya) — Active overdue loan assessed at 6 days * ₹2 = ₹12 (Unpaid)
    insertFine.run(
      overdueLoan1, mStu2, 6, 12.0, 0.0, 0.0, 'Unpaid', isoStr(-1)
    );

    // Fine 4: Student 3 (Pradeep) — Active overdue loan assessed at 9 days * ₹2 = ₹18 (Unpaid)
    insertFine.run(
      overdueLoan2, mStu3, 9, 18.0, 0.0, 0.0, 'Unpaid', isoStr(-1)
    );

    const insertPayment = db.prepare(`
      INSERT INTO FinePayments (
        fineAssessmentId, memberId, amount, paymentMethod, receiptNumber, recordedByUserId, paidAt, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPayment.run(
      fine1Id, mStu1, 6.0, 'Cash Counter', 'KSR-RCPT-2026-001', libUserId, isoStr(-12),
      'Partial fine payment recorded at Central Library Desk'
    );
    insertPayment.run(
      fine2Id, mStu4, 10.0, 'UPI / College Fee Counter', 'KSR-RCPT-2026-002', libUserId, isoStr(-5),
      'Full overdue fine settlement'
    );

    // 15. Notifications
    const insertNotif = db.prepare(`
      INSERT INTO Notifications (
        userId, memberId, title, message, notificationType, isRead, relatedEntityType, relatedEntityId, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertNotif.run(
      Number(stu1User.lastInsertRowid), mStu1,
      'Book Issued: Introduction to Algorithms',
      `Copy KSR-ACC-1001 has been issued to your account. Due date: ${dayStr(5)}.`,
      'Issue', 0, 'Loan', 1, isoStr(-9)
    );
    insertNotif.run(
      Number(stu1User.lastInsertRowid), mStu1,
      'Outstanding Fine Balance Reminder (₹10.00)',
      'You have a remaining balance of ₹10.00 from loan KSR-LN-2026-005. Please settle at the library counter.',
      'FinePayment', 0, 'FineAssessment', fine1Id, isoStr(-2)
    );
    insertNotif.run(
      Number(stu2User.lastInsertRowid), mStu2,
      'Overdue Loan Notice: Digital Design (KSR-ACC-1004)',
      'Your borrowed copy KSR-ACC-1004 is 6 days past its due date. Current accrued fine: ₹12.00.',
      'Overdue', 0, 'Loan', overdueLoan1, isoStr(-1)
    );
    insertNotif.run(
      Number(stu2User.lastInsertRowid), mStu2,
      'Reservation Queue Confirmed (#1 in Queue)',
      'Your reservation KSR-RES-2026-001 for Microelectronic Circuits is #1 in the queue.',
      'ReservationAvailable', 0, 'Reservation', 1, isoStr(-3)
    );

    // 16. Initial Audit Logs
    logAudit({
      actorUserId: adminUserId,
      actorName: 'Dr. R. Karthikeyan (Chief Library Administrator)',
      actorRole: 'SuperAdmin',
      action: 'SYSTEM_SEED_INITIALIZED',
      entityType: 'System',
      entityId: 'KSRCE-LMS',
      details: 'Initialized KSR College of Engineering Library Management System demonstration dataset.',
    });
    logAudit({
      actorUserId: libUserId,
      actorName: 'S. Meenakshi Sundaram (Senior Librarian)',
      actorRole: 'Librarian',
      action: 'LOAN_ISSUED',
      entityType: 'Loan',
      entityId: 'KSR-LN-2026-001',
      details: 'Issued KSR-ACC-1001 (Introduction to Algorithms) to Aravind Kumar S. (73152313001).',
    });

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Error seeding database:', err);
    throw err;
  }
}
