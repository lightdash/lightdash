import { Divider, List, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import { CatalogPanel } from '../features/catalog/components';

const Catalog = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    const customersData = [
        { id: 1, name: 'John Doe', email: 'john.doe@example.com', age: 28 },
        { id: 2, name: 'Jane Smith', email: 'jane.smith@example.com', age: 34 },
        { id: 3, name: 'Sam Brown', email: 'sam.brown@example.com', age: 22 },
    ];

    const customerColumns = [
        { header: 'ID', accessor: 'id' },
        { header: 'Name', accessor: 'name' },
        { header: 'Email', accessor: 'email' },
        { header: 'Age', accessor: 'age' },
    ];

    const renderTableRows = () =>
        customersData.map((customer) => (
            <tr key={customer.id}>
                <td>{customer.id}</td>
                <td>{customer.name}</td>
                <td>{customer.email}</td>
                <td>{customer.age}</td>
            </tr>
        ));

    return (
        <Page
            lockScroll={isSidebarOpen}
            withPaddedContent
            withFooter
            withRightSidebar
            isRightSidebarOpen={isSidebarOpen}
            rightSidebar={
                <Stack>
                    <Text size="lg" fw={500}>
                        Customers
                    </Text>
                    <Divider />
                    <Text>
                        The "Customers" table is a key dataset in the Lightdash
                        DBT project. It contains detailed information about each
                        customer, including their unique identifier, name, email
                        address, and age. This table is essential for
                        understanding customer demographics and behaviors, and
                        it serves as a foundation for various analytics and
                        reporting tasks. Here is a summary of the fields in the
                        "Customers" table: ID: A unique identifier for each
                        customer (integer). Name: The full name of the customer
                        (string). Email: The email address of the customer
                        (string). Age: The age of the customer (integer).
                    </Text>
                    <Text size="sm">Fields</Text>
                    <Table>
                        <thead>
                            <tr>
                                {customerColumns.map((column) => (
                                    <th key={column.accessor}>
                                        {column.header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>{renderTableRows()}</tbody>
                    </Table>

                    <Divider />
                    <Text size="lg" fw={500}>
                        Charts
                    </Text>
                    <List>
                        <List.Item>
                            <Text size="sm">
                                <strong>Customer Demographics Chart</strong>:
                                This chart provides an overview of the customer
                                demographics, including the distribution of ages
                                and the geographical locations of customers.
                                (Bar Chart)
                            </Text>
                        </List.Item>
                        <List.Item>
                            <Text size="sm">
                                <strong>Customer Engagement Over Time</strong>:
                                This chart tracks customer engagement metrics
                                over time, showing trends in how customers
                                interact with the product or service. (Line
                                Chart)
                            </Text>
                        </List.Item>
                        <List.Item>
                            <Text size="sm">
                                <strong>
                                    Customer Lifetime Value (CLV) Analysis
                                </strong>
                                : This chart analyzes the lifetime value of
                                customers, helping to identify the most valuable
                                customer segments. (Pie Chart)
                            </Text>
                        </List.Item>
                        <List.Item>
                            <Text size="sm">
                                <strong>Email Campaign Performance</strong>:
                                This chart evaluates the performance of
                                different email campaigns, highlighting open
                                rates, click-through rates, and conversions.
                                (Column Chart)
                            </Text>
                        </List.Item>
                        <List.Item>
                            <Text size="sm">
                                <strong>Age Distribution of Customers</strong>:
                                This chart shows the distribution of customer
                                ages, helping to understand the age demographics
                                of the customer base. (Histogram)
                            </Text>
                        </List.Item>
                    </List>
                </Stack>
            }
            rightSidebarWidthProps={{
                defaultWidth: 600,
                minWidth: 600,
                maxWidth: 800,
            }}
        >
            <button onClick={() => setSidebarOpen(!isSidebarOpen)}>
                Toggle Sidebar
            </button>

            <CatalogPanel projectUuid={selectedProjectUuid} />
        </Page>
    );
};

export default Catalog;
