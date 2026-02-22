
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({}, { strict: false });

const Admin = mongoose.model("admin", UserSchema, "admins");

export default Admin