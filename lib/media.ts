import * as ImagePicker from "expo-image-picker";
import {supabase} from "./supabase";
export async function uploadPostMedia(userId:string){
 const p=await ImagePicker.requestMediaLibraryPermissionsAsync(); if(!p.granted) throw new Error("Permissão da galeria não concedida.");
 const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images","videos"],quality:0.85,videoMaxDuration:60});
 if(r.canceled||!r.assets[0]) return null;
 const a=r.assets[0], response=await fetch(a.uri), blob=await response.blob();
 const ext=a.fileName?.split(".").pop()||(a.type==="video"?"mp4":"jpg"), path=userId+"/"+Date.now()+"."+ext;
 const {error}=await supabase.storage.from("post-media").upload(path,blob,{contentType:a.mimeType||"application/octet-stream"});
 if(error) throw error;
 return {url:supabase.storage.from("post-media").getPublicUrl(path).data.publicUrl,type:a.type==="video"?"video" as const:"image" as const};
}
