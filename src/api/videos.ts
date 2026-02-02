import { respondWithJSON } from "./json";
import { rm } from "fs/promises";
import { type ApiConfig } from "../config.js";
import type { BunRequest, S3File } from "bun";
import { BadRequestError, UserForbiddenError } from "./errors.js";
import { getBearerToken, validateJWT } from "../auth.js";
import { getVideo, updateVideo } from "../db/videos.js";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { S3Client } from "bun";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
    //Verify and authenticate
    const { videoId } = req.params as { videoId?: string };
    if (!videoId) {
      throw new BadRequestError("Invalid video ID");
    }
  
    const token = getBearerToken(req.headers);
    const userID = validateJWT(token, cfg.jwtSecret);
  
    console.log("uploading video to AWS: ", videoId, "by user", userID);
  
    //Handle upload process
    const file = await req.formData();
    const fileData = file.get("video");
  
    //Check file is a valid file type and image type
    if (!(fileData instanceof File)) {
      throw new BadRequestError("Invalid file type");
    }
    const fileType = fileData.type;
    const allowedTypes = ["video/mp4"];
    if (!allowedTypes.includes(fileType)) {
      throw new BadRequestError("Invalid file type. Only .mp4 accepted");
    }
    //Check file size and error if file too large
    const MAX_UPLOAD_SIZE = 1 << 30;
    if (fileData.size > MAX_UPLOAD_SIZE) {
      throw new BadRequestError("File too large and must not exceed 1GB in size");
    }

    // Get video metadata from database and check owner
    const video = getVideo(cfg.db, videoId);
    if (!video) {
      throw new BadRequestError("Video not found");
    }
    if (video?.userID != userID) {
      throw new UserForbiddenError("Unauthorised user");
    }

    //Read file contents into an array buffer and converts to a buffer
    let videoData = new ArrayBuffer(fileData.size);
    videoData = await fileData.arrayBuffer();
    const fileExt = fileType.split("/")[1];
    const videoString = randomBytes(32).toString('hex');
    const videoName = `${videoString}.${fileExt}`;
    const tmpPath = path.join(cfg.assetsRoot,"tmp",videoName);
  
    //Create the file in assets temp
    console.log("writing temp file", tmpPath);
    await Bun.write(tmpPath,videoData);

    //upload to s3
    console.log("uploading to s3", videoName);
    const s3File = cfg.s3Client.file(videoName);
    const s3BodyFile = Bun.file(tmpPath);

    // Turn it into an ArrayBuffer for the writer
    const s3Body = await s3BodyFile.arrayBuffer();

    const writer = s3File.writer({
      retry: 3,
      queueSize: 10,
      partSize: 5 * 1024 * 1024,
    });

    writer.write(s3Body);
    await writer.end();

    //write to database
    console.log("updating DB");
    video.videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${videoName}`;
    updateVideo(cfg.db,video)

    //delete from tmp
    console.log(`Deleting temporary file from ${tmpPath}`);
    await rm(tmpPath, { force: true });


  return respondWithJSON(200, video);
}
