const crypto = require("crypto");
const {hash_password, verify_pass} = require("./passwordUtil");

async function regiUserAPI(io, db) {
     /* (async () => {
        console.log(hash_password("secretpassword"));
    })(); */

    io.on('connection', (socket) => {
        console.log("Registration API connected.")
        socket.on('newAccDetails', async (data) => {
            const {tempEmpCode, firstName, middleName, lastName, suffix, email, tempPassword, tempConfPassword} = data;
            const uuid = crypto.randomUUID();
            const empCode = tempEmpCode.toString().toUpperCase();
            const passwordHash = await hash_password(tempPassword);
            const confPassword = await verify_pass(tempConfPassword, passwordHash);

            const query = 
            `INSERT INTO Employees (
                employee_id, 
                employee_code,
                first_name, 
                last_name, 
                middle_name, 
                suffix, email, 
                password) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;
            
            try {
                const {ifEmployeeExists} = require("./dbChecks");
                const exists = await ifEmployeeExists(db, email, empCode);
                console.log(exists);
                if (exists === true) {
                    socket.emit('registrationLog', {
                        success: false,
                        rawData: `User records already exists!`
                    });
                    return
                }
                if (confPassword === true && (email && tempPassword && tempConfPassword && firstName && lastName)) {
                    const [records] = await db.query(query, [uuid, empCode, firstName, lastName, middleName, suffix, email, passwordHash]);

                    socket.emit('registrationLog', {
                        success: confPassword,
                        rawData: `Successfully added the details!`
                    });
                } else {
                    socket.emit('registrationLog', {
                        success: false,
                        rawData: "Wrong password or empty fields."
                    });
                }
            } catch (err) {
                socket.emit('registrationLog', {
                    success: false,
                    rawData: "error"
                });
                console.log(err);
            }
        }) 
    });
}

module.exports = { regiUserAPI };