LHT52
Issue（已修改）（暂未回复）

![issue截图](image.png)

原版TTN解码器缺失str_pad() 函数函数定义导致FPort4以及FPort5的上传载荷无解码数据

![仓库原版文件](image-1.png)

![测试FPort4报错](image-2.png)

![测试FPort5报错](image-3.png)

已做修改至"LHT52 Decoder TTN - vHL1.js"