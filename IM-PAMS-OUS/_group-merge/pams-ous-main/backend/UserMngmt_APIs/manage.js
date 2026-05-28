const {getEmployeeDetails} = require("./dbChecks");
async function getEmployeeData(db, data, socket, mode) {

    const email = data.email;
    const queryResult = await getEmployeeDetails(db, email);
    const empID = queryResult?.employee_id;
    const empCode = queryResult?.employee_code;
    const lastName = queryResult?.last_name;
    const firstName = queryResult?.first_name;
    const middleName = queryResult?.middle_name;
    const suffix = queryResult?.suffix;
    
    if (mode === "get") {
        if (empID === undefined) {
            accountFound = false;
            socket.emit('managementLog', {
                success: false,
                rawData: `Account doesn't exist!`
            });
            socket.emit('returnFetchData', {
                success:false
            });
            return;
        } 
        accountFound = true;
        socket.emit('managementLog', {
            success: true,
            rawData: `${email}:${empID}:${accountFound}`
        });

        socket.emit('returnFetchData', {
            email: email,
            empCode: empCode,
            lastName: lastName,
            firstName: firstName,
            middleName: middleName,
            suffix: suffix,
            success: true
        });
    } else if (mode === "delete") {
        const query = `DELETE FROM Employees
        WHERE employee_id = ?;`;

        db.query(query, [empID]);
    }

    return {email: email, 
        empID: empID
    }
}

async function editEmployeeData(socket, db, data) {
    const {empCode, email, currEmail, lastName, firstName, middleName, suffix} = data;
    const results = await getEmployeeDetails(db, currEmail);
    const empID = results?.employee_id;

    const query = `
    UPDATE Employees
    SET employee_code = ?, email = ?, last_name = ?, first_name = ?, middle_name = ?, suffix = ?
    WHERE employee_id = ?
    LIMIT 1;
    `;
    try {
        if (email === "" || lastName === "" || firstName === "") {
            socket.emit('managementLog', {
                success: false,
                rawData: `Unsuccessful: empty fields.`
            });
            return
        }
        const [updateRecord] = await db.query(query, [empCode, email, lastName, firstName, middleName, suffix, empID]);
        socket.emit('managementLog', {
            success: true,
            rawData: `Successfully updated the details!`
        });
    } catch (err) {
        socket.emit('managementLog', {
            success: false,
            rawData: `Unsuccessful: ${err}`
        });
    }
}

async function manageAccountAPI(io, db) {
    io.on('connection', (socket) => {
        console.log("Management API connected.");

        let accountFound = false;

        socket.on('getEmployeeData', (data) => {
            getEmployeeData(db, data, socket, "get");
        });

        socket.on('deleteAccount', async (data) => {
            const {email, empID} = await getEmployeeData(db, data, socket, "delete");
            
            if (empID !== undefined) {
                socket.emit('managementLog', {
                    success: true,
                    rawData: `Deletion of ${email} by ${empID} successful.`
                });
            } else {
                socket.emit('managementLog', {
                    success: false,
                    rawData: `Deletion of ${email} unsucessful.`
                }); 
            }
        });

        socket.on('updateDetails', (data) => {
            editEmployeeData(socket, db, data);
        });

    });
}

module.exports = {manageAccountAPI};