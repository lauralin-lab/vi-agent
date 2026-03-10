import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Avatar, Space, Typography } from 'antd';
import {
  UserOutlined,
  MobileOutlined,
  SettingOutlined,
  GiftOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/users', icon: <UserOutlined />, label: '\u7528\u6237\u7ba1\u7406' },
  { key: '/devices', icon: <MobileOutlined />, label: '\u8bbe\u5907\u4fe1\u606f' },
  { key: '/settings', icon: <SettingOutlined />, label: '\u7cfb\u7edf\u8bbe\u7f6e' },
  { key: '/invite-codes', icon: <GiftOutlined />, label: '\u9080\u8bf7\u7801' },
];

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { adminInfo, logout } = useAuth();

  const selectedKey = '/' + location.pathname.split('/')[1];

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        style={{ position: 'sticky', top: 0, height: '100vh' }}
      >
        <div
          style={{
            height: 32,
            margin: 16,
            color: '#fff',
            fontWeight: 'bold',
            fontSize: collapsed ? 14 : 18,
            textAlign: 'center',
            lineHeight: '32px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {collapsed ? 'VA' : 'VI Agent Admin'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <Space>
            <Avatar
              size="small"
              src={adminInfo?.photo_url}
              icon={<UserOutlined />}
            />
            <Text>{adminInfo?.email || adminInfo?.display_name || 'Admin'}</Text>
            <Button
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              size="small"
            >
              退出登录
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
