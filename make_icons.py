import struct, zlib, os
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')
os.makedirs(d, exist_ok=True)
def png(n, path):
    G=(31,58,95); W=(255,255,255)
    rows=[]
    c=n/2; r=n*0.30; t=n*0.09
    for y in range(n):
        row=bytearray([0])
        for x in range(n):
            px=G
            # white cross (health/safety plus sign)
            if (abs(x-c)<t and abs(y-c)<r) or (abs(y-c)<t and abs(x-c)<r): px=W
            row+=bytes(px)
        rows.append(bytes(row))
    raw=b''.join(rows)
    def ch(k,b): 
        x=struct.pack('>I',len(b))+k+b
        return x+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
    open(path,'wb').write(b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',n,n,8,2,0,0,0))+ch(b'IDAT',zlib.compress(raw,9))+ch(b'IEND',b''))
png(192,os.path.join(d,'icon-192.png')); png(512,os.path.join(d,'icon-512.png'))
open(os.path.join(d,'icon.svg'),'w').write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1f3a5f"/><path fill="#fff" d="M226 130h60v96h96v60h-96v96h-60v-96h-96v-60h96z"/></svg>')
