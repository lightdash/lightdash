import type { Employee } from './data/employees';

let employees: Employee[] = [
  { id: 1, name: 'Edward Perry', age: 25, joinDate: new Date().toISOString(), role: 'Finance' },
  { id: 2, name: 'Josephine Drake', age: 36, joinDate: new Date().toISOString(), role: 'Market' },
  {
    id: 3,
    name: 'Cody Phillips',
    age: 19,
    joinDate: new Date().toISOString(),
    role: 'Development',
  },
];

export const getEmployeesStore = () => employees;

export const setEmployeesStore = (newEmployees: Employee[]) => {
  employees = newEmployees;
};
