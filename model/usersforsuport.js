import mongoose from "mongoose"


const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    profile:{
        type: String,
        required: true
    }
},
    { timestamps: true }
);

const Users = mongoose.model("Suportusers", userSchema);

export default Users;