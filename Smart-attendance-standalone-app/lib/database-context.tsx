import React, { createContext, useContext } from "react";
import { ref, get, set, update, query, orderByChild, equalTo } from "firebase/database";
import { database } from "./firebase";
import { User } from "firebase/auth";

export interface AttendanceMethod {
  type: "location" | "location+face" | "location+qr" | "location+code";
  requiredDistance?: number; // in meters
}

export interface ClassInfo {
  id: string;
  name: string;
  code: string;
  instructorName: string;
  instructorId: string;
  startTime: string;
  endTime: string;
  location: {
    latitude: number;
    longitude: number;
    name: string;
  };
  attendanceMethod: AttendanceMethod;
  maxStudents?: number;
}

export interface AttendanceRecord {
  userId: string;
  classId: string;
  timestamp: number;
  method: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  faceImage?: string; // URL to face image in storage
  qrCode?: string;
  code?: string;
  status: "present" | "absent" | "late";
}

interface DatabaseContextType {
  getClasses: (userId: string) => Promise<ClassInfo[]>;
  getClassById: (classId: string) => Promise<ClassInfo | null>;
  getAttendanceMethod: (classId: string) => Promise<AttendanceMethod | null>;
  recordAttendance: (record: AttendanceRecord) => Promise<void>;
  getAttendanceHistory: (userId: string) => Promise<AttendanceRecord[]>;
  getClassAttendance: (classId: string) => Promise<AttendanceRecord[]>;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const getClasses = async (userId: string): Promise<ClassInfo[]> => {
    try {
      const classesRef = ref(database, "classes");
      const snapshot = await get(classesRef);
      if (!snapshot.exists()) {
        return [];
      }

      const classes: ClassInfo[] = [];
      snapshot.forEach((childSnapshot) => {
        const classData = childSnapshot.val();
        classes.push({
          id: childSnapshot.key || "",
          ...classData,
        });
      });

      return classes;
    } catch (error) {
      console.error("Error fetching classes:", error);
      throw error;
    }
  };

  const getClassById = async (classId: string): Promise<ClassInfo | null> => {
    try {
      const classRef = ref(database, `classes/${classId}`);
      const snapshot = await get(classRef);
      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: classId,
        ...snapshot.val(),
      };
    } catch (error) {
      console.error("Error fetching class:", error);
      throw error;
    }
  };

  const getAttendanceMethod = async (classId: string): Promise<AttendanceMethod | null> => {
    try {
      const methodRef = ref(database, `classes/${classId}/attendanceMethod`);
      const snapshot = await get(methodRef);
      if (!snapshot.exists()) {
        return null;
      }

      return snapshot.val();
    } catch (error) {
      console.error("Error fetching attendance method:", error);
      throw error;
    }
  };

  const recordAttendance = async (record: AttendanceRecord): Promise<void> => {
    try {
      const attendanceRef = ref(database, `attendance/${record.classId}/${record.userId}`);
      await set(attendanceRef, {
        ...record,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error recording attendance:", error);
      throw error;
    }
  };

  const getAttendanceHistory = async (userId: string): Promise<AttendanceRecord[]> => {
    try {
      const attendanceRef = ref(database, "attendance");
      const snapshot = await get(attendanceRef);
      if (!snapshot.exists()) {
        return [];
      }

      const records: AttendanceRecord[] = [];
      snapshot.forEach((classSnapshot) => {
        classSnapshot.forEach((userSnapshot) => {
          if (userSnapshot.key === userId) {
            records.push(userSnapshot.val());
          }
        });
      });

      return records.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error("Error fetching attendance history:", error);
      throw error;
    }
  };

  const getClassAttendance = async (classId: string): Promise<AttendanceRecord[]> => {
    try {
      const attendanceRef = ref(database, `attendance/${classId}`);
      const snapshot = await get(attendanceRef);
      if (!snapshot.exists()) {
        return [];
      }

      const records: AttendanceRecord[] = [];
      snapshot.forEach((userSnapshot) => {
        records.push(userSnapshot.val());
      });

      return records.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error("Error fetching class attendance:", error);
      throw error;
    }
  };

  return (
    <DatabaseContext.Provider
      value={{
        getClasses,
        getClassById,
        getAttendanceMethod,
        recordAttendance,
        getAttendanceHistory,
        getClassAttendance,
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error("useDatabase must be used within a DatabaseProvider");
  }
  return context;
}
