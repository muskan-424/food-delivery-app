import React, { useContext, useEffect, useState } from "react";
import "./Profile.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { toast } from "react-toastify";

const Profile = () => {
  const { token, url } = useContext(StoreContext);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [deletingPicture, setDeletingPicture] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (token) {
      fetchProfile();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${url}/api/profile`, {
        headers: { token },
      });
      if (response.data.success) {
        setProfile(response.data.data);
        setProfileForm({
          name: response.data.data.name || "",
          phone: response.data.data.phone || "",
        });
      } else {
        toast.error(response.data.message || "Failed to load profile");
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Unable to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      const response = await axios.put(
        `${url}/api/profile`,
        profileForm,
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Profile updated successfully");
        setProfile(response.data.data);
      } else {
        toast.error(response.data.message || "Failed to update profile");
      }
    } catch (error) {
      console.error("Profile update error:", error);
      toast.error(
        error.response?.data?.message || "Failed to update profile"
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePictureUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("profilePicture", file);
    try {
      setUploadingPicture(true);
      const response = await axios.post(
        `${url}/api/profile/picture`,
        formData,
        {
          headers: {
            token,
            "Content-Type": "multipart/form-data",
          },
        }
      );
      if (response.data.success) {
        toast.success("Profile picture updated");
        setProfile((prev) => ({
          ...prev,
          profilePicture: response.data.data.profilePicture,
        }));
      } else {
        toast.error(response.data.message || "Failed to upload picture");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        error.response?.data?.message || "Failed to upload picture"
      );
    } finally {
      setUploadingPicture(false);
      event.target.value = "";
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New password and confirm password do not match");
      return;
    }
    try {
      setChangingPassword(true);
      const response = await axios.put(
        `${url}/api/profile/password`,
        {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Password updated successfully");
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      } else {
        toast.error(response.data.message || "Failed to change password");
      }
    } catch (error) {
      console.error("Password change error:", error);
      toast.error(
        error.response?.data?.message || "Failed to change password"
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeletePicture = async () => {
    if (!window.confirm("Are you sure you want to delete your profile picture?")) {
      return;
    }
    try {
      setDeletingPicture(true);
      const response = await axios.delete(`${url}/api/profile/picture`, {
        headers: { token },
      });
      if (response.data.success) {
        toast.success("Profile picture deleted");
        setProfile((prev) => ({
          ...prev,
          profilePicture: "",
        }));
      } else {
        toast.error(response.data.message || "Failed to delete picture");
      }
    } catch (error) {
      console.error("Delete picture error:", error);
      toast.error(
        error.response?.data?.message || "Failed to delete picture"
      );
    } finally {
      setDeletingPicture(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteAccountPassword) {
      toast.error("Please enter your password to confirm account deletion");
      return;
    }
    try {
      setDeletingAccount(true);
      const response = await axios.delete(`${url}/api/profile/account`, {
        headers: { token },
        data: { password: deleteAccountPassword }
      });
      if (response.data.success) {
        toast.success("Account deleted successfully");
        // Redirect to home or logout
        window.location.href = "/";
      } else {
        toast.error(response.data.message || "Failed to delete account");
      }
    } catch (error) {
      console.error("Delete account error:", error);
      toast.error(
        error.response?.data?.message || "Failed to delete account"
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const getAvatarUrl = () => {
    if (!profile?.profilePicture) return null;
    return profile.profilePicture.startsWith("http")
      ? profile.profilePicture
      : `${url}/images/${profile.profilePicture}`;
  };

  if (!token) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <p>Please log in to view and edit your profile.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <h2>My Profile</h2>

      <div className="profile-card">
        <div className="profile-avatar-section">
          {getAvatarUrl() ? (
            <img src={getAvatarUrl()} alt={profile?.name} className="profile-avatar" />
          ) : (
            <div className="profile-avatar placeholder">
              {profile?.name?.charAt(0).toUpperCase() || "U"}
            </div>
          )}
          <div className="avatar-actions">
            <label className="upload-btn">
              <input
                type="file"
                accept="image/*"
                onChange={handlePictureUpload}
                disabled={uploadingPicture}
              />
              {uploadingPicture ? "Uploading..." : "Change Picture"}
            </label>
            {profile?.profilePicture && (
              <button
                type="button"
                className="delete-picture-btn"
                onClick={handleDeletePicture}
                disabled={deletingPicture}
              >
                {deletingPicture ? "Deleting..." : "Delete Picture"}
              </button>
            )}
          </div>
        </div>

        <form className="profile-form" onSubmit={handleProfileSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              name="name"
              value={profileForm.name}
              onChange={handleProfileChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={profile?.email || ""} disabled />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input
              type="tel"
              name="phone"
              value={profileForm.phone}
              onChange={handleProfileChange}
              placeholder="Enter phone number"
            />
          </div>
          <button type="submit" className="save-btn" disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>

      <div className="profile-card">
        <h3>Change Password</h3>
        <form className="profile-form" onSubmit={handlePasswordChange}>
          <div className="form-group">
            <label>Current Password</label>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
              }
              required
            />
          </div>
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
              }
              required
              minLength={8}
            />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
              }
              required
              minLength={8}
            />
          </div>
          <button type="submit" className="save-btn" disabled={changingPassword}>
            {changingPassword ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>

      {/* Delete Account Section */}
      <div className="profile-card danger-zone">
        <h3>Danger Zone</h3>
        <p className="danger-warning">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button
          type="button"
          className="delete-account-btn"
          onClick={() => setShowDeleteAccountModal(true)}
        >
          Delete My Account
        </button>
      </div>

      {/* Delete Account Modal */}
      {showDeleteAccountModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteAccountModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Account</h2>
              <button onClick={() => setShowDeleteAccountModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="warning-text">
                This action cannot be undone. This will permanently delete your account
                and all associated data.
              </p>
              <div className="form-group">
                <label>Enter your password to confirm *</label>
                <input
                  type="password"
                  value={deleteAccountPassword}
                  onChange={(e) => setDeleteAccountPassword(e.target.value)}
                  placeholder="Your password"
                  required
                />
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="btn-danger"
                  disabled={deletingAccount || !deleteAccountPassword}
                >
                  {deletingAccount ? "Deleting..." : "Delete Account"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteAccountModal(false);
                    setDeleteAccountPassword("");
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;


