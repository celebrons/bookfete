const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const uploadFile = async (bucket, file, folder = '') => {
  try {
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${folder}/${uuidv4()}.${fileExt}`;
    
    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600'
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return { success: true, url: publicUrl, fileName };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const deleteFile = async (bucket, fileName) => {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([fileName]);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getSignedUrl = async (bucket, fileName, expiresIn = 3600) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(fileName, expiresIn);

    if (error) throw error;
    return { success: true, url: data.signedUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = { uploadFile, deleteFile, getSignedUrl };